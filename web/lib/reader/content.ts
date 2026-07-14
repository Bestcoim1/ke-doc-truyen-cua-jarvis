import type { Block, ChapterRevisionContent } from "./types";

function isValidMark(raw: unknown): raw is Block["marks"][number] {
  if (!raw || typeof raw !== "object") return false;
  const mark = raw as Record<string, unknown>;
  return (
    (mark.type === "bold" || mark.type === "italic") &&
    typeof mark.start === "number" &&
    Number.isFinite(mark.start) &&
    typeof mark.end === "number" &&
    Number.isFinite(mark.end)
  );
}

function parseBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as Record<string, unknown>;
  if (typeof block.anchor_id !== "string" || block.anchor_id.length === 0)
    return null;
  if (block.type !== "paragraph" && block.type !== "scene_break") return null;
  if (typeof block.text !== "string") return null;
  // Marks are decorative: drop malformed entries rather than fail the whole
  // block — a bad mark should never blank out readable prose.
  const marks = Array.isArray(block.marks)
    ? (block.marks.filter(isValidMark) as Block["marks"])
    : [];
  return {
    anchor_id: block.anchor_id,
    type: block.type,
    text: block.text,
    marks,
  };
}

/**
 * Runtime-validate a `chapter_revisions.content_blocks` blob before the
 * reader trusts it. `commit_import_job` writes it as
 * `{ schema_version: 1, blocks: [...] }`, so this normally passes — but a
 * legacy or migrated row with a different shape must degrade to a recovery
 * notice, not crash the reader with `blocks.map`/`.length` on undefined
 * (FR-12 §5: "hiển thị recovery state thay vì màn hình trắng"). Returns null
 * when the blob can't be safely rendered; the reader page turns that into a
 * per-chapter recovery card.
 */
export function parseChapterContent(
  raw: unknown,
): ChapterRevisionContent | null {
  if (!raw || typeof raw !== "object") return null;
  const content = raw as Record<string, unknown>;
  if (content.schema_version !== 1) return null;
  if (!Array.isArray(content.blocks)) return null;

  const blocks: Block[] = [];
  for (const rawBlock of content.blocks) {
    const block = parseBlock(rawBlock);
    // One unrenderable block means the chapter's content can't be trusted as
    // a whole (silently dropping it would misrepresent the manuscript).
    if (!block) return null;
    blocks.push(block);
  }
  if (blocks.length === 0) return null;

  return { schema_version: 1, blocks };
}
