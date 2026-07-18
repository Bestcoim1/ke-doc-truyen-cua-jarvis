import { ArrowRight, Network } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { RELATIONSHIP_LABELS } from "@/lib/graph/transform";
import type { ConnectedStoryComponent } from "@/lib/graph/types";

export function LibraryGraphCard({
  component,
}: {
  component: ConnectedStoryComponent;
}) {
  const size = 240;
  const center = size / 2;
  const radius = component.stories.length <= 2 ? 62 : 82;
  const positions = new Map(
    component.stories.map((story, index) => {
      const angle =
        component.stories.length === 1
          ? 0
          : (index / component.stories.length) * Math.PI * 2 - Math.PI / 2;
      return [
        story.id,
        component.stories.length === 1
          ? { x: center, y: center }
          : {
              x: center + Math.cos(angle) * radius,
              y: center + Math.sin(angle) * radius,
            },
      ] as const;
    }),
  );
  const typeSummary = Object.entries(component.relationshipTypeCounts)
    .map(
      ([type, count]) =>
        `${RELATIONSHIP_LABELS[type as keyof typeof RELATIONSHIP_LABELS]}: ${count}`,
    )
    .join(" · ");

  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-3xl border"
      style={{
        background: "var(--kd-surface)",
        borderColor: "var(--kd-border)",
      }}
    >
      <div
        className="border-b p-4"
        style={{
          borderColor: "var(--kd-border)",
          background:
            "radial-gradient(circle at center, color-mix(in srgb, var(--kd-gilt) 15%, transparent), transparent 68%)",
        }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="mx-auto aspect-square w-full max-w-64"
          role="img"
          aria-label={`Preview cụm ${component.representativeStory.title}, gồm ${component.stories.length} tác phẩm`}
        >
          {component.relationships.map((relationship) => {
            const source = positions.get(relationship.sourceStoryId);
            const target = positions.get(relationship.targetStoryId);
            if (!source || !target) return null;
            return (
              <line
                key={relationship.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="var(--kd-text-muted)"
                strokeWidth="2"
                opacity="0.65"
              />
            );
          })}
          {component.stories.map((story) => {
            const position = positions.get(story.id)!;
            const representative = story.id === component.representativeStory.id;
            return (
              <g key={story.id}>
                {representative ? (
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r="15"
                    fill="var(--kd-gilt)"
                    opacity="0.28"
                  />
                ) : null}
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={representative ? 10 : 8}
                  fill="var(--kd-binding)"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "var(--kd-binding)",
              color: "var(--kd-accent-foreground)",
            }}
          >
            <Network size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-lg font-extrabold">
              {component.representativeStory.title}
            </h2>
            <p className="mt-1 text-xs text-[var(--kd-text-muted)]">
              {component.stories.length} tác phẩm · {component.relationships.length} quan hệ
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--kd-text-muted)]">
          {typeSummary || "Tác phẩm độc lập, chưa có quan hệ."}
        </p>
        <Button asChild className="mt-auto pt-2" variant="link">
          <Link href={`/read/${component.representativeStory.id}/graph`}>
            Xem chi tiết <ArrowRight size={15} />
          </Link>
        </Button>
      </div>
    </article>
  );
}
