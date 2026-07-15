import type { Block } from "@/lib/reader/types";
import type { ChapterAnnotationRow } from "@/lib/reader/queries";

function renderMarkedText(block: Block, annotations: ChapterAnnotationRow[] = []) {
  const { text, marks } = block;
  if (marks.length === 0 && annotations.length === 0) return text;

  const points = new Set<number>([0, text.length]);
  marks.forEach((mark) => {
    points.add(mark.start);
    points.add(mark.end);
  });
  annotations.forEach((ann) => {
    points.add(ann.start_offset);
    points.add(ann.end_offset);
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
    const activeAnnotations = annotations.filter(
      (ann) => ann.start_offset <= start && ann.end_offset >= end,
    );
    
    let node: React.ReactNode = text.slice(start, end);
    
    // Apply styling marks
    for (const mark of activeMarks) {
      node =
        mark.type === "bold" ? (
          <strong key={`b-${start}`}>{node}</strong>
        ) : (
          <em key={`i-${start}`}>{node}</em>
        );
    }
    
    // Apply annotation highlight if exists
    if (activeAnnotations.length > 0) {
      // Just take the first active annotation for color (simplification)
      const ann = activeAnnotations[0];
      node = (
        <mark
          key={`ann-${start}`}
          data-annotation-id={ann.id}
          style={{
            backgroundColor: ann.color || "var(--kd-accent)",
            color: "inherit",
            cursor: "pointer",
            borderRadius: "0.15em",
            padding: "0.1em 0",
          }}
          title={ann.note || undefined}
        >
          {node}
        </mark>
      );
    }
    
    segments.push(<span key={start}>{node}</span>);
  }
  return segments;
}

export function BlockRenderer({
  blocks,
  annotations = [],
}: {
  blocks: Block[];
  annotations?: ChapterAnnotationRow[];
}) {
  return (
    <>
      {blocks.map((block) => {
        const blockAnnotations = annotations.filter(
          (a) => a.anchor_id === block.anchor_id
        );
        return block.type === "scene_break" ? (
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
            className="mb-[1.1em] whitespace-pre-line relative"
          >
            {renderMarkedText(block, blockAnnotations)}
          </p>
        );
      })}
    </>
  );
}
