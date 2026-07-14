import type { Block } from "@/lib/reader/types";

function renderMarkedText(block: Block) {
  const { text, marks } = block;
  if (marks.length === 0) return text;

  const points = new Set<number>([0, text.length]);
  marks.forEach((mark) => {
    points.add(mark.start);
    points.add(mark.end);
  });
  const boundaries = Array.from(points).sort((a, b) => a - b);

  const segments: React.ReactNode[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (start >= end) continue;

    const activeMarks = marks.filter(
      (mark) => mark.start <= start && mark.end >= end,
    );
    let node: React.ReactNode = text.slice(start, end);
    for (const mark of activeMarks) {
      node =
        mark.type === "bold" ? (
          <strong key={`b-${start}`}>{node}</strong>
        ) : (
          <em key={`i-${start}`}>{node}</em>
        );
    }
    segments.push(<span key={start}>{node}</span>);
  }
  return segments;
}

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block) =>
        block.type === "scene_break" ? (
          <p
            key={block.anchor_id}
            id={block.anchor_id}
            data-anchor-id={block.anchor_id}
            className="my-6 text-center tracking-widest"
            style={{ color: "var(--kd-text-muted)" }}
          >
            {block.text}
          </p>
        ) : (
          <p
            key={block.anchor_id}
            id={block.anchor_id}
            data-anchor-id={block.anchor_id}
            className="mb-[1.1em] whitespace-pre-line"
          >
            {renderMarkedText(block)}
          </p>
        ),
      )}
    </>
  );
}
