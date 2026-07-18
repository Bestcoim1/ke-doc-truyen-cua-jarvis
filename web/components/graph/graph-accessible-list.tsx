"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  PERSPECTIVE_LABELS,
  relationshipFromPerspective,
} from "@/lib/graph/transform";
import type {
  GraphData,
  GraphNode,
  StoredRelationshipType,
  StoryRelationship,
} from "@/lib/graph/types";

import { ManageRelationshipDialog } from "./manage-relationship-dialog";

export function GraphAccessibleList({
  graph,
  primaryStoryId,
  relationships,
  storyTitles,
  selectedNodeId,
  onSelectNode,
  onToggleStory,
  onOptimisticRelationshipUpdate,
  onOptimisticRelationshipDelete,
}: {
  graph: GraphData;
  primaryStoryId: string;
  relationships: StoryRelationship[];
  storyTitles: Record<string, string>;
  selectedNodeId: GraphNode["id"] | null;
  onSelectNode: (node: GraphNode) => void;
  onToggleStory: (node: GraphNode) => void;
  onOptimisticRelationshipUpdate?: (
    relationship: StoryRelationship,
    relationshipType: StoredRelationshipType,
    reverseDirection: boolean,
  ) => (() => void) | void;
  onOptimisticRelationshipDelete?: (
    relationship: StoryRelationship,
  ) => (() => void) | void;
}) {
  const nodesByType = {
    story: graph.nodes.filter((node) => node.type === "story"),
    section: graph.nodes.filter((node) => node.type === "section"),
    chapter: graph.nodes.filter((node) => node.type === "chapter"),
  };

  return (
    <aside
      className="h-full overflow-y-auto border-l p-4"
      style={{
        background: "var(--kd-surface)",
        borderColor: "var(--kd-border)",
      }}
      aria-label="Danh sách nội dung graph"
    >
      <h2 className="text-lg font-extrabold">Danh sách graph</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--kd-text-muted)" }}>
        Cách truy cập đầy đủ bằng bàn phím, song song với canvas.
      </p>

      <section className="mt-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">
          Tác phẩm ({nodesByType.story.length})
        </h3>
        <ul className="mt-2 space-y-2">
          {nodesByType.story.map((node) => (
            <li
              key={node.id}
              className="rounded-xl border p-2"
              style={{ borderColor: "var(--kd-border)" }}
            >
              <button
                type="button"
                className="min-h-11 w-full rounded-lg px-2 text-left text-sm font-bold"
                aria-pressed={selectedNodeId === node.id}
                onClick={() => onSelectNode(node)}
              >
                {node.label}
              </button>
              <div className="mt-1 flex flex-wrap gap-2">
                {node.storyId !== primaryStoryId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleStory(node)}
                  >
                    {node.isExpanded ? "Thu gọn" : "Mở rộng"}
                  </Button>
                ) : null}
                <Button asChild variant="link" size="sm">
                  <Link href={`/read/${node.storyId}`}>Mở Reader</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {relationships.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">
            Quan hệ ({relationships.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {relationships.map((relationship) => {
              const view = relationshipFromPerspective(
                relationship,
                primaryStoryId,
              );
              return (
                <li
                  key={relationship.id}
                  className="rounded-xl border p-3 text-sm"
                  style={{ borderColor: "var(--kd-border)" }}
                >
                  <p>
                    <strong>{storyTitles[view.otherStoryId] ?? "Tác phẩm"}</strong>
                    {" — "}
                    {PERSPECTIVE_LABELS[view.perspective]}
                  </p>
                  <div className="mt-2">
                    <ManageRelationshipDialog
                      relationship={relationship}
                      currentStoryId={primaryStoryId}
                      currentStoryTitle={storyTitles[primaryStoryId] ?? "Tác phẩm"}
                      otherStoryTitle={storyTitles[view.otherStoryId] ?? "Tác phẩm"}
                      onOptimisticUpdate={(type, reverse) =>
                        onOptimisticRelationshipUpdate?.(
                          relationship,
                          type,
                          reverse,
                        )
                      }
                      onOptimisticDelete={() =>
                        onOptimisticRelationshipDelete?.(relationship)
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <NodeSection
        title="Section"
        nodes={nodesByType.section}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
      <NodeSection
        title="Chương"
        nodes={nodesByType.chapter}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
    </aside>
  );
}

function NodeSection({
  title,
  nodes,
  selectedNodeId,
  onSelectNode,
}: {
  title: string;
  nodes: GraphNode[];
  selectedNodeId: GraphNode["id"] | null;
  onSelectNode: (node: GraphNode) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <section className="mt-5">
      <h3 className="text-sm font-extrabold uppercase tracking-wide">
        {title} ({nodes.length})
      </h3>
      <ul className="mt-2 space-y-1">
        {nodes.map((node) => (
          <li key={node.id} className="flex items-center gap-1">
            <button
              type="button"
              className="min-h-11 min-w-0 flex-1 rounded-lg px-3 text-left text-sm hover:bg-[var(--kd-bg)]"
              aria-pressed={selectedNodeId === node.id}
              onClick={() => onSelectNode(node)}
            >
              <span className="block truncate" title={node.label}>
                {node.label}
              </span>
            </button>
            {node.type === "chapter" ? (
              <Button asChild variant="ghost" size="sm">
                <Link
                  href={`/read/${node.storyId}/${node.entityId}`}
                  aria-label={`Mở ${node.label}`}
                >
                  Mở
                </Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
