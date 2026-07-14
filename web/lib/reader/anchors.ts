import { sha256 } from "js-sha256";
import { buildAnchorId, extractFingerprintFromAnchorId } from "./anchor-utils";

/**
 * PRD §10.2: normalize Unicode/whitespace before hashing so an unchanged
 * paragraph keeps the same fingerprint across re-imports.
 */
export function normalizeParagraphText(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function fingerprintParagraph(text: string): string {
  return sha256(normalizeParagraphText(text)).slice(0, 12);
}

// Re-export for compatibility
export { buildAnchorId, extractFingerprintFromAnchorId };

/**
 * Assigns anchor_id to each paragraph-like block in order, tracking
 * per-fingerprint occurrence counts within the chapter.
 */
export function assignAnchorIds<T extends { text: string }>(
  blocks: T[],
): (T & { anchorId: string; fingerprint: string })[] {
  const seen = new Map<string, number>();

  return blocks.map((block) => {
    const fingerprint = fingerprintParagraph(block.text);
    const occurrenceIndex = seen.get(fingerprint) ?? 0;
    seen.set(fingerprint, occurrenceIndex + 1);
    return {
      ...block,
      fingerprint,
      anchorId: buildAnchorId(fingerprint, occurrenceIndex),
    };
  });
}

export function hashContentBlocks(blocks: { text: string }[]): string {
  const normalized = blocks
    .map((block) => normalizeParagraphText(block.text))
    .join("\n");
  return sha256(normalized);
}
