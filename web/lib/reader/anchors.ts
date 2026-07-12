import { createHash } from "node:crypto";

/**
 * PRD §10.2: normalize Unicode/whitespace before hashing so an unchanged
 * paragraph keeps the same fingerprint across re-imports.
 */
export function normalizeParagraphText(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function fingerprintParagraph(text: string): string {
  return createHash("sha256")
    .update(normalizeParagraphText(text))
    .digest("hex")
    .slice(0, 12);
}

/**
 * occurrenceIndex disambiguates repeated identical paragraphs within the
 * same chapter (PRD §10.2.3) — 0 is unsuffixed, 1+ gets an "_n" suffix.
 */
export function buildAnchorId(fingerprint: string, occurrenceIndex: number): string {
  return occurrenceIndex === 0 ? `p_${fingerprint}` : `p_${fingerprint}_${occurrenceIndex}`;
}

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
    return { ...block, fingerprint, anchorId: buildAnchorId(fingerprint, occurrenceIndex) };
  });
}

/** Inverse of buildAnchorId — safe since fingerprint (hex) never contains "_". */
export function extractFingerprintFromAnchorId(anchorId: string): string {
  return anchorId.replace(/^p_/, "").split("_")[0];
}

export function hashContentBlocks(blocks: { text: string }[]): string {
  const normalized = blocks.map((block) => normalizeParagraphText(block.text)).join("\n");
  return createHash("sha256").update(normalized).digest("hex");
}
