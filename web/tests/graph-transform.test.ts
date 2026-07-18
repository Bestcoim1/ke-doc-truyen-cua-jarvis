import { describe, expect, it } from "vitest";

import {
  buildGraphFocus,
  buildConnectedStoryComponents,
  buildStoryHierarchyGraph,
  chapterNodeId,
  filterGraphData,
  mergeGraphData,
  relationshipFromPerspective,
  sectionNodeId,
  shouldRenderGraphNodeLabel,
  storyNodeId,
} from "@/lib/graph/transform";
import type {
  GraphData,
  StoredRelationshipType,
  StoryHierarchy,
  StoryRelationship,
} from "@/lib/graph/types";

const hierarchy: StoryHierarchy = {
  story: { id: "same-id", title: "Truyện" },
  sections: [
    {
      id: "same-id",
      storyId: "same-id",
      parentSectionId: null,
      title: "Hồi một",
      type: "arc",
      sortOrder: 1,
    },
    {
      id: "nested",
      storyId: "same-id",
      parentSectionId: "same-id",
      title: "Phần con",
      type: "part",
      sortOrder: 0,
    },
  ],
  chapters: [
    {
      id: "same-id",
      storyId: "same-id",
      sectionId: null,
      title: "Mở đầu",
      kind: "regular",
      sortOrder: 0,
    },
    {
      id: "inside",
      storyId: "same-id",
      sectionId: "same-id",
      title: "Trong hồi",
      kind: "extra",
      sortOrder: 1,
    },
  ],
};

describe("graph transforms", () => {
  it("namespaces entity IDs and preserves mixed Reader tree ordering", () => {
    const graph = buildStoryHierarchyGraph(hierarchy, { isPrimaryStory: true });

    expect(storyNodeId("same-id")).toBe("story:same-id");
    expect(sectionNodeId("same-id")).toBe("section:same-id");
    expect(chapterNodeId("same-id")).toBe("chapter:same-id");
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(
      graph.nodes.length,
    );
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "story:same-id",
      "chapter:same-id",
      "section:same-id",
      "section:nested",
      "chapter:inside",
    ]);
    expect(graph.links).toContainEqual(
      expect.objectContaining({
        source: "story:same-id",
        target: "chapter:same-id",
      }),
    );
  });

  it("maps all stored relationships from both story perspectives", () => {
    const inverse: Record<StoredRelationshipType, string> = {
      sequel: "prequel",
      spinoff: "original_of_spinoff",
      side_story: "main_story",
      adaptation: "source_material",
      related: "related",
    };

    for (const type of Object.keys(inverse) as StoredRelationshipType[]) {
      const row: StoryRelationship = {
        id: type,
        sourceStoryId: "a",
        targetStoryId: "b",
        relationshipType: type,
      };
      expect(relationshipFromPerspective(row, "a")).toMatchObject({
        otherStoryId: "b",
        perspective: type,
        isCurrentStorySource: true,
      });
      expect(relationshipFromPerspective(row, "b")).toMatchObject({
        otherStoryId: "a",
        perspective: inverse[type],
        isCurrentStorySource: false,
      });
    }
  });

  it("builds components for chains, cycles and isolated stories", () => {
    const stories = ["a", "b", "c", "z"].map((id, index) => ({
      id,
      title: id.toUpperCase(),
      createdAt: `2026-01-0${index + 1}T00:00:00Z`,
    }));
    const relationships: StoryRelationship[] = [
      { id: "ab", sourceStoryId: "a", targetStoryId: "b", relationshipType: "sequel" },
      { id: "bc", sourceStoryId: "b", targetStoryId: "c", relationshipType: "spinoff" },
      { id: "ca", sourceStoryId: "c", targetStoryId: "a", relationshipType: "related" },
    ];

    const components = buildConnectedStoryComponents(stories, relationships);
    expect(components).toHaveLength(2);
    expect(components[0]).toMatchObject({
      id: "a",
      representativeStory: { id: "a" },
      relationshipTypeCounts: { sequel: 1, spinoff: 1, related: 1 },
    });
    expect(components[0].stories.map((story) => story.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(components[1]).toMatchObject({ id: "z", relationships: [] });
  });

  it("filters nodes out of the simulation without dangling links", () => {
    const graph = buildStoryHierarchyGraph(hierarchy);
    const withoutChapters = filterGraphData(graph, {
      showSections: true,
      showChapters: false,
    });
    expect(withoutChapters.nodes.some((node) => node.type === "chapter")).toBe(
      false,
    );

    const storiesOnly = filterGraphData(graph, {
      showSections: false,
      showChapters: true,
    });
    expect(storiesOnly.nodes.map((node) => node.type)).toEqual(["story"]);
    const ids = new Set(storiesOnly.nodes.map((node) => node.id));
    expect(
      storiesOnly.links.every(
        (link) => ids.has(link.source) && ids.has(link.target),
      ),
    ).toBe(true);
  });

  it("deduplicates nodes and links when a lazy hierarchy is merged twice", () => {
    const graph = buildStoryHierarchyGraph(hierarchy);
    const base: GraphData = { nodes: [graph.nodes[0]], links: [] };
    const once = mergeGraphData(base, graph);
    const twice = mergeGraphData(once, graph);
    expect(twice.nodes).toHaveLength(graph.nodes.length);
    expect(twice.links).toHaveLength(graph.links.length);
  });

  it("focuses only the selected node, its direct neighbors and incident links", () => {
    const graph = buildStoryHierarchyGraph(hierarchy);
    const focus = buildGraphFocus(graph, sectionNodeId("same-id"));

    expect([...focus.nodeIds]).toEqual(
      expect.arrayContaining([
        sectionNodeId("same-id"),
        storyNodeId("same-id"),
        sectionNodeId("nested"),
        chapterNodeId("inside"),
      ]),
    );
    expect(focus.nodeIds.has(chapterNodeId("same-id"))).toBe(false);
    expect(focus.linkIds.size).toBe(3);
    expect(buildGraphFocus(graph, null).nodeIds.size).toBe(0);
  });

  it("keeps long section/chapter labels off canvas even when selected or hovered", () => {
    expect(
      shouldRenderGraphNodeLabel({
        nodeType: "section",
        measuredScreenWidth: 240,
        globalScale: 4,
        nodeCount: 20,
        selected: true,
        hovered: true,
      }),
    ).toBe(false);
    expect(
      shouldRenderGraphNodeLabel({
        nodeType: "chapter",
        measuredScreenWidth: 180,
        globalScale: 4,
        nodeCount: 20,
        selected: true,
        hovered: true,
      }),
    ).toBe(false);
    expect(
      shouldRenderGraphNodeLabel({
        nodeType: "story",
        measuredScreenWidth: 500,
        globalScale: 1,
        nodeCount: 1_000,
        selected: false,
        hovered: false,
      }),
    ).toBe(true);
  });

  it("draws short chapter labels only close-up or while actively inspected", () => {
    const input = {
      nodeType: "chapter" as const,
      measuredScreenWidth: 80,
      globalScale: 1,
      nodeCount: 300,
      selected: false,
      hovered: false,
    };
    expect(shouldRenderGraphNodeLabel(input)).toBe(false);
    expect(
      shouldRenderGraphNodeLabel({ ...input, globalScale: 2 }),
    ).toBe(true);
    expect(
      shouldRenderGraphNodeLabel({ ...input, selected: true }),
    ).toBe(true);
  });
});
