import { buildTocTree, type TocNode } from "@/lib/reader/tree";

import type {
  ConnectedStoryComponent,
  GraphData,
  GraphFilters,
  GraphLink,
  GraphNode,
  GraphNodeId,
  GraphStory,
  RelationshipPerspective,
  RelationshipView,
  StoredRelationshipType,
  StoryHierarchy,
  StoryRelationship,
} from "./types";

export const RELATIONSHIP_LABELS: Record<StoredRelationshipType, string> = {
  sequel: "Phần tiếp theo",
  spinoff: "Tác phẩm phái sinh",
  side_story: "Ngoại truyện",
  adaptation: "Chuyển thể",
  related: "Liên quan",
};

export const PERSPECTIVE_LABELS: Record<RelationshipPerspective, string> = {
  sequel: "Phần tiếp theo",
  prequel: "Phần trước",
  spinoff: "Tác phẩm phái sinh",
  original_of_spinoff: "Tác phẩm gốc",
  side_story: "Ngoại truyện",
  main_story: "Truyện chính",
  adaptation: "Bản chuyển thể",
  source_material: "Nguyên tác",
  related: "Liên quan",
};

export function storyNodeId(id: string): `story:${string}` {
  return `story:${id}`;
}

export function sectionNodeId(id: string): `section:${string}` {
  return `section:${id}`;
}

export function chapterNodeId(id: string): `chapter:${string}` {
  return `chapter:${id}`;
}

export function relationshipFromPerspective(
  relationship: StoryRelationship,
  currentStoryId: string,
): RelationshipView {
  const isCurrentStorySource = relationship.sourceStoryId === currentStoryId;
  const otherStoryId = isCurrentStorySource
    ? relationship.targetStoryId
    : relationship.sourceStoryId;

  const perspective: RelationshipPerspective = (() => {
    if (relationship.relationshipType === "related") return "related";
    if (isCurrentStorySource) return relationship.relationshipType;

    switch (relationship.relationshipType) {
      case "sequel":
        return "prequel";
      case "spinoff":
        return "original_of_spinoff";
      case "side_story":
        return "main_story";
      case "adaptation":
        return "source_material";
    }
  })();

  return { otherStoryId, perspective, isCurrentStorySource };
}

function containsLink(source: GraphNodeId, target: GraphNodeId): GraphLink {
  return {
    id: `contains:${source}->${target}`,
    source,
    target,
    type: "contains",
  };
}

export function relationshipGraphLink(
  relationship: StoryRelationship,
): GraphLink {
  return {
    id: `relationship:${relationship.id}`,
    source: storyNodeId(relationship.sourceStoryId),
    target: storyNodeId(relationship.targetStoryId),
    type: relationship.relationshipType,
    label: RELATIONSHIP_LABELS[relationship.relationshipType],
    relationshipId: relationship.id,
  };
}

export function buildStoryHierarchyGraph(
  hierarchy: StoryHierarchy,
  options: { isPrimaryStory?: boolean } = {},
): GraphData {
  const { story, sections, chapters } = hierarchy;
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const toc = buildTocTree(
    sections.map((section) => ({
      id: section.id,
      parent_section_id: section.parentSectionId,
      title: section.title,
      sort_order: section.sortOrder,
    })),
    chapters.map((chapter) => ({
      id: chapter.id,
      section_id: chapter.sectionId,
      title: chapter.title,
      sort_order: chapter.sortOrder,
    })),
  );

  const nodes: GraphNode[] = [
    {
      id: storyNodeId(story.id),
      entityId: story.id,
      label: story.title,
      type: "story",
      storyId: story.id,
      childCount: toc.length,
      isPrimaryStory: options.isPrimaryStory ?? false,
      isExpanded: true,
    },
  ];
  const links: GraphLink[] = [];

  function append(node: TocNode, parentId: GraphNodeId) {
    if (node.kind === "section") {
      const section = sectionById.get(node.id);
      if (!section) return;
      const id = sectionNodeId(section.id);
      nodes.push({
        id,
        entityId: section.id,
        label: section.title,
        type: "section",
        storyId: story.id,
        sectionType: section.type,
        childCount: node.children.length,
      });
      links.push(containsLink(parentId, id));
      for (const child of node.children) append(child, id);
      return;
    }

    const chapter = chapterById.get(node.id);
    if (!chapter) return;
    const id = chapterNodeId(chapter.id);
    nodes.push({
      id,
      entityId: chapter.id,
      label: chapter.title,
      type: "chapter",
      storyId: story.id,
      chapterKind: chapter.kind,
    });
    links.push(containsLink(parentId, id));
  }

  for (const node of toc) append(node, storyNodeId(story.id));
  return { nodes, links };
}

export function mergeGraphData(base: GraphData, addition: GraphData): GraphData {
  const nodes = new Map(base.nodes.map((node) => [node.id, node]));
  for (const node of addition.nodes) nodes.set(node.id, node);

  const links = new Map(base.links.map((link) => [link.id, link]));
  for (const link of addition.links) links.set(link.id, link);

  return { nodes: [...nodes.values()], links: [...links.values()] };
}

export function filterGraphData(
  data: GraphData,
  filters: GraphFilters,
): GraphData {
  // Sections and chapters are one hierarchy. The UI disables chapter display
  // while sections are hidden so a simulation never receives orphan nodes.
  const showChapters = filters.showSections && filters.showChapters;
  const nodes = data.nodes.filter(
    (node) =>
      node.type === "story" ||
      (node.type === "section" && filters.showSections) ||
      (node.type === "chapter" && showChapters),
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = data.links.filter(
    (link) => nodeIds.has(link.source) && nodeIds.has(link.target),
  );
  return { nodes, links };
}

export function buildGraphFocus(
  data: GraphData,
  selectedNodeId: GraphNodeId | null,
): { nodeIds: Set<GraphNodeId>; linkIds: Set<string> } {
  const nodeIds = new Set<GraphNodeId>();
  const linkIds = new Set<string>();
  if (
    !selectedNodeId ||
    !data.nodes.some((node) => node.id === selectedNodeId)
  ) {
    return { nodeIds, linkIds };
  }

  nodeIds.add(selectedNodeId);
  for (const link of data.links) {
    if (link.source === selectedNodeId) {
      nodeIds.add(link.target);
      linkIds.add(link.id);
    } else if (link.target === selectedNodeId) {
      nodeIds.add(link.source);
      linkIds.add(link.id);
    }
  }
  return { nodeIds, linkIds };
}

const MAX_NODE_LABEL_WIDTH: Record<"section" | "chapter", number> = {
  section: 176,
  chapter: 132,
};

export function shouldRenderGraphNodeLabel({
  nodeType,
  measuredScreenWidth,
  globalScale,
  nodeCount,
  selected,
  hovered,
}: {
  nodeType: GraphNode["type"];
  measuredScreenWidth: number;
  globalScale: number;
  nodeCount: number;
  selected: boolean;
  hovered: boolean;
}): boolean {
  if (nodeType === "story") return true;
  if (measuredScreenWidth > MAX_NODE_LABEL_WIDTH[nodeType]) return false;
  if (nodeType === "section") return true;

  return (nodeCount <= 400 && globalScale >= 2) || selected || hovered;
}

export function buildConnectedStoryComponents(
  stories: (GraphStory & { createdAt: string })[],
  relationships: StoryRelationship[],
): ConnectedStoryComponent[] {
  const storyById = new Map(stories.map((story) => [story.id, story]));
  const adjacency = new Map(stories.map((story) => [story.id, new Set<string>()]));

  const activeRelationships = relationships.filter(
    (relationship) =>
      storyById.has(relationship.sourceStoryId) &&
      storyById.has(relationship.targetStoryId),
  );
  for (const relationship of activeRelationships) {
    adjacency.get(relationship.sourceStoryId)!.add(relationship.targetStoryId);
    adjacency.get(relationship.targetStoryId)!.add(relationship.sourceStoryId);
  }

  const visited = new Set<string>();
  const components: ConnectedStoryComponent[] = [];

  for (const story of [...stories].sort((a, b) => a.id.localeCompare(b.id))) {
    if (visited.has(story.id)) continue;
    const stack = [story.id];
    const componentIds: string[] = [];
    visited.add(story.id);

    while (stack.length > 0) {
      const current = stack.pop()!;
      componentIds.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }

    componentIds.sort((a, b) => a.localeCompare(b));
    const idSet = new Set(componentIds);
    const componentStories = componentIds
      .map((id) => storyById.get(id)!)
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    const componentRelationships = activeRelationships.filter(
      (relationship) =>
        idSet.has(relationship.sourceStoryId) &&
        idSet.has(relationship.targetStoryId),
    );
    const relationshipTypeCounts: ConnectedStoryComponent["relationshipTypeCounts"] =
      {};
    for (const relationship of componentRelationships) {
      relationshipTypeCounts[relationship.relationshipType] =
        (relationshipTypeCounts[relationship.relationshipType] ?? 0) + 1;
    }

    components.push({
      id: componentIds[0],
      representativeStory: componentStories[0],
      stories: componentStories,
      relationships: componentRelationships,
      relationshipTypeCounts,
    });
  }

  return components.sort((a, b) =>
    a.representativeStory.createdAt.localeCompare(
      b.representativeStory.createdAt,
    ) || a.id.localeCompare(b.id),
  );
}
