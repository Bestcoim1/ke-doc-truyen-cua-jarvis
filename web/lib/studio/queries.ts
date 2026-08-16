import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";
import { fetchAllPages } from "@/lib/supabase/pagination";
import type {
  ContinuityStudioData,
  StudioStorySummary,
} from "@/lib/studio/types";
import { logEvent } from "@/lib/telemetry";

type StudioLoadError = "missing_schema" | "load_failed";

function isMissingContinuitySchemaError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204"
  );
}

export async function getStudioStories(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<{ data: StudioStorySummary[] | null; error: string | null }> {
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("stories")
      .select("id, title, description, updated_at, writing_status, cover_image_url")
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (error) {
    logEvent("studio.stories_query_error", { code: error.code });
    return { data: null, error: error.code };
  }
  return {
    data: (data ?? []).map((story) => ({
      id: story.id,
      title: story.title,
      description: story.description,
      updatedAt: story.updated_at,
      writingStatus: story.writing_status,
      coverImageUrl: story.cover_image_url,
    })),
    error: null,
  };
}

export async function getContinuityStudio(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  storyId: string,
): Promise<{ data: ContinuityStudioData | null; error: StudioLoadError | null }> {
  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, title, description, updated_at, writing_status, cover_image_url")
    .eq("id", storyId)
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .maybeSingle();
  if (storyError || !story) {
    if (storyError) logEvent("studio.story_query_error", { code: storyError.code });
    return { data: null, error: "load_failed" };
  }

  const [entities, facts, evidence, threads, chapters] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_entities")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .is("archived_at", null)
        .order("kind")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_facts")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_evidence")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_plot_threads")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("chapters")
        .select("id, title, sort_order")
        .eq("story_id", storyId)
        .eq("is_active", true)
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
  ]);

  const firstError =
    entities.error ?? facts.error ?? evidence.error ?? threads.error ?? chapters.error;
  if (firstError) {
    logEvent("studio.dashboard_query_error", { code: firstError.code });
    return {
      data: null,
      error: isMissingContinuitySchemaError(firstError)
        ? "missing_schema"
        : "load_failed",
    };
  }

  const [analysisRuns, timelineEvents, characterKnowledge] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_analysis_runs")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .order("started_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_timeline_events")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .order("chapter_sequence", { nullsFirst: false })
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_character_knowledge")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .order("chapter_sequence", { nullsFirst: false })
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  const p1Error =
    analysisRuns.error ?? timelineEvents.error ?? characterKnowledge.error;
  const p1Available = !p1Error;
  if (p1Error && !isMissingContinuitySchemaError(p1Error)) {
    logEvent("studio.p1_query_error", { code: p1Error.code });
    return { data: null, error: "load_failed" };
  }

  const inboxItems: Database["public"]["Tables"]["continuity_inbox_items"]["Row"][] = [];
  const inboxEvidence: Database["public"]["Tables"]["continuity_inbox_evidence"]["Row"][] = [];
  const reviewedEvidence: Database["public"]["Tables"]["continuity_inbox_evidence"]["Row"][] = [];
  if (p1Available) {
    const completedRunIds = (analysisRuns.data ?? [])
      .filter((run) => run.status === "completed")
      .map((run) => run.id);
    for (let index = 0; index < completedRunIds.length; index += 100) {
      const runIds = completedRunIds.slice(index, index + 100);
      const page = await fetchAllPages((from, to) =>
        supabase
          .from("continuity_inbox_items")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("story_id", storyId)
          .eq("review_status", "pending")
          .in("run_id", runIds)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      );
      if (page.error) {
        logEvent("studio.inbox_query_error", { code: page.error.code });
        return { data: null, error: "load_failed" };
      }
      inboxItems.push(...(page.data ?? []));
    }

    const inboxIds = inboxItems.map((item) => item.id);
    for (let index = 0; index < inboxIds.length; index += 100) {
      const itemIds = inboxIds.slice(index, index + 100);
      const page = await fetchAllPages((from, to) =>
        supabase
          .from("continuity_inbox_evidence")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("story_id", storyId)
          .in("inbox_item_id", itemIds)
          .order("start_line", { nullsFirst: false })
          .order("id")
          .range(from, to),
      );
      if (page.error) {
        logEvent("studio.inbox_evidence_query_error", { code: page.error.code });
        return { data: null, error: "load_failed" };
      }
      inboxEvidence.push(...(page.data ?? []));
    }

    const reviewedSourceIds = [
      ...(timelineEvents.data ?? []).map((event) => event.source_inbox_item_id),
      ...(characterKnowledge.data ?? []).map((record) => record.source_inbox_item_id),
    ];
    const uniqueReviewedSourceIds = [...new Set(reviewedSourceIds)];
    for (let index = 0; index < uniqueReviewedSourceIds.length; index += 100) {
      const itemIds = uniqueReviewedSourceIds.slice(index, index + 100);
      const page = await fetchAllPages((from, to) =>
        supabase
          .from("continuity_inbox_evidence")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("story_id", storyId)
          .in("inbox_item_id", itemIds)
          .order("start_line", { nullsFirst: false })
          .order("id")
          .range(from, to),
      );
      if (page.error) {
        logEvent("studio.reviewed_evidence_query_error", { code: page.error.code });
        return { data: null, error: "load_failed" };
      }
      reviewedEvidence.push(...(page.data ?? []));
    }
  }

  const inboxEvidenceByItem = new Map<
    string,
    Database["public"]["Tables"]["continuity_inbox_evidence"]["Row"][]
  >();
  for (const item of inboxEvidence) {
    const list = inboxEvidenceByItem.get(item.inbox_item_id) ?? [];
    list.push(item);
    inboxEvidenceByItem.set(item.inbox_item_id, list);
  }

  return {
    data: {
      story: {
        id: story.id,
        title: story.title,
        description: story.description,
        updatedAt: story.updated_at,
        writingStatus: story.writing_status,
        coverImageUrl: story.cover_image_url,
      },
      entities: entities.data ?? [],
      facts: facts.data ?? [],
      evidence: evidence.data ?? [],
      threads: threads.data ?? [],
      analysisRuns: p1Available ? (analysisRuns.data ?? []).slice(0, 10) : [],
      inboxItems: inboxItems.map((item) => ({
        ...item,
        evidence: inboxEvidenceByItem.get(item.id) ?? [],
      })),
      reviewedEvidence,
      timelineEvents: p1Available ? (timelineEvents.data ?? []) : [],
      characterKnowledge: p1Available ? (characterKnowledge.data ?? []) : [],
      p1Available,
      chapters: (chapters.data ?? []).map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        sortOrder: chapter.sort_order,
      })),
    },
    error: null,
  };
}
