import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";
import { logEvent } from "@/lib/telemetry";

import {
  buildConnectedStoryComponents,
  buildStoryHierarchyGraph,
  mergeGraphData,
  relationshipGraphLink,
  storyNodeId,
} from "./transform";
import type {
  ConnectedStoryComponent,
  GraphChapter,
  GraphSection,
  GraphStory,
  GraphQueryResult,
  StoryGraphShell,
  StoryHierarchy,
  StoryRelationship,
} from "./types";

type RelationshipRow =
  Database["public"]["Tables"]["story_relationships"]["Row"];

function mapRelationship(row: RelationshipRow): StoryRelationship {
  return {
    id: row.id,
    sourceStoryId: row.source_story_id,
    targetStoryId: row.target_story_id,
    relationshipType: row.relationship_type,
  };
}

async function getHierarchyRows(
  supabase: SupabaseClient<Database>,
  storyId: string,
): Promise<GraphQueryResult<{ sections: GraphSection[]; chapters: GraphChapter[] }>> {
  const [sectionsResult, chaptersResult] = await Promise.all([
    supabase
      .from("sections")
      .select("id, story_id, parent_section_id, title, type, sort_order")
      .eq("story_id", storyId)
      .eq("is_active", true),
    supabase
      .from("chapters")
      .select("id, story_id, section_id, title, kind, sort_order")
      .eq("story_id", storyId)
      .eq("is_active", true),
  ]);

  const error = sectionsResult.error ?? chaptersResult.error;
  if (error) {
    logEvent("graph.hierarchy_query_error", { code: error.code, storyId });
    return { data: null, error: error.code };
  }

  return {
    data: {
      sections: (sectionsResult.data ?? []).map((row) => ({
        id: row.id,
        storyId: row.story_id,
        parentSectionId: row.parent_section_id,
        title: row.title,
        type: row.type,
        sortOrder: row.sort_order,
      })),
      chapters: (chaptersResult.data ?? []).map((row) => ({
        id: row.id,
        storyId: row.story_id,
        sectionId: row.section_id,
        title: row.title,
        kind: row.kind,
        sortOrder: row.sort_order,
      })),
    },
    error: null,
  };
}

export async function getStoryHierarchyForGraph(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  storyId: string,
): Promise<GraphQueryResult<StoryHierarchy>> {
  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, title, created_at")
    .eq("id", storyId)
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .maybeSingle();

  if (storyError) {
    logEvent("graph.story_query_error", { code: storyError.code, storyId });
    return { data: null, error: storyError.code };
  }
  if (!story) return { data: null, error: null };

  const hierarchyRows = await getHierarchyRows(supabase, storyId);
  if (!hierarchyRows.data) {
    return { data: null, error: hierarchyRows.error };
  }

  return {
    data: {
      story: { id: story.id, title: story.title, createdAt: story.created_at },
      ...hierarchyRows.data,
    },
    error: null,
  };
}

export async function getStoryGraphShell(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  storyId: string,
): Promise<GraphQueryResult<StoryGraphShell>> {
  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, title, created_at")
    .eq("id", storyId)
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .maybeSingle();

  if (storyError) {
    logEvent("graph.story_query_error", { code: storyError.code, storyId });
    return { data: null, error: storyError.code };
  }
  if (!story) return { data: null, error: null };

  const [hierarchyRows, relationshipsResult, activeStoriesResult] =
    await Promise.all([
      getHierarchyRows(supabase, storyId),
      supabase
        .from("story_relationships")
        .select(
          "id, source_story_id, target_story_id, relationship_type, created_at, updated_at",
        )
        .or(`source_story_id.eq.${storyId},target_story_id.eq.${storyId}`),
      supabase
        .from("stories")
        .select("id, title")
        .eq("owner_id", ownerId)
        .eq("status", "active")
        .order("title"),
    ]);

  if (!hierarchyRows.data) {
    return { data: null, error: hierarchyRows.error };
  }
  const shellError = relationshipsResult.error ?? activeStoriesResult.error;
  if (shellError) {
    logEvent("graph.shell_query_error", { code: shellError.code, storyId });
    return { data: null, error: shellError.code };
  }

  const candidateRelationships = (relationshipsResult.data ?? []).map(
    mapRelationship,
  );
  const relatedIds = [
    ...new Set(
      candidateRelationships.map((relationship) =>
        relationship.sourceStoryId === storyId
          ? relationship.targetStoryId
          : relationship.sourceStoryId,
      ),
    ),
  ];

  let relatedStoryRows: { id: string; title: string }[] = [];
  if (relatedIds.length > 0) {
    const relatedResult = await supabase
      .from("stories")
      .select("id, title")
      .in("id", relatedIds)
      .eq("owner_id", ownerId)
      .eq("status", "active");
    if (relatedResult.error) {
      logEvent("graph.related_stories_query_error", {
        code: relatedResult.error.code,
        storyId,
      });
      return { data: null, error: relatedResult.error.code };
    }
    relatedStoryRows = relatedResult.data ?? [];
  }

  const activeRelatedIds = new Set(relatedStoryRows.map((row) => row.id));
  const relationships = candidateRelationships.filter((relationship) => {
    const otherId =
      relationship.sourceStoryId === storyId
        ? relationship.targetStoryId
        : relationship.sourceStoryId;
    return activeRelatedIds.has(otherId);
  });

  const primaryStory: GraphStory = {
    id: story.id,
    title: story.title,
    createdAt: story.created_at,
  };
  let graph = buildStoryHierarchyGraph(
    { story: primaryStory, ...hierarchyRows.data },
    { isPrimaryStory: true },
  );
  graph = mergeGraphData(graph, {
    nodes: relatedStoryRows.map((relatedStory) => ({
      id: storyNodeId(relatedStory.id),
      entityId: relatedStory.id,
      label: relatedStory.title,
      type: "story",
      storyId: relatedStory.id,
      isExpanded: false,
    })),
    links: relationships.map(relationshipGraphLink),
  });

  const unavailableIds = new Set([storyId, ...activeRelatedIds]);
  return {
    data: {
      story: primaryStory,
      graph,
      relationships,
      relatedStories: relatedStoryRows.map(({ id, title }) => ({ id, title })),
      availableStories: (activeStoriesResult.data ?? []).filter(
        (activeStory) => !unavailableIds.has(activeStory.id),
      ),
    },
    error: null,
  };
}

export async function getLibraryGraphOverview(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<GraphQueryResult<ConnectedStoryComponent[]>> {
  const { data: storyRows, error: storiesError } = await supabase
    .from("stories")
    .select("id, title, created_at")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .order("created_at");

  if (storiesError) {
    logEvent("graph.library_stories_query_error", { code: storiesError.code });
    return { data: null, error: storiesError.code };
  }
  if (!storyRows || storyRows.length === 0) {
    return { data: [], error: null };
  }

  const storyIds = storyRows.map((story) => story.id);
  const { data: relationshipRows, error: relationshipsError } = await supabase
    .from("story_relationships")
    .select(
      "id, source_story_id, target_story_id, relationship_type, created_at, updated_at",
    )
    .in("source_story_id", storyIds)
    .in("target_story_id", storyIds);

  if (relationshipsError) {
    logEvent("graph.library_relationships_query_error", {
      code: relationshipsError.code,
    });
    return { data: null, error: relationshipsError.code };
  }

  return {
    data: buildConnectedStoryComponents(
      storyRows.map((story) => ({
        id: story.id,
        title: story.title,
        createdAt: story.created_at,
      })),
      (relationshipRows ?? []).map(mapRelationship),
    ),
    error: null,
  };
}
