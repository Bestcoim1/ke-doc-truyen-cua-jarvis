import { describe, expect, it } from "vitest";

import { fingerprintParagraph } from "../lib/reader/anchors";
import { resolveResumeAnchor } from "../lib/reader/resume-fallback";
import type { Block } from "../lib/reader/types";

function block(text: string): Block {
  return { anchor_id: "unused", type: "paragraph", text, marks: [] };
}

describe("resolveResumeAnchor", () => {
  it("resolves exact anchor id match", () => {
    const newBlocks = [
      block("Đoạn một."),
      block("Đoạn hai."),
      block("Đoạn ba."),
    ];
    const oldAnchorId = `p_${fingerprintParagraph("Đoạn hai.")}`;

    const result = resolveResumeAnchor(
      oldAnchorId,
      fingerprintParagraph("Đoạn hai."),
      1,
      3,
      newBlocks,
    );

    expect(result).toMatchObject({ method: "exact", ordinal: 1 });
  });

  it("falls back to fingerprint match when the anchor id itself is gone but the paragraph survives", () => {
    // Old chapter had an extra paragraph inserted before "Đoạn hai.", so its
    // anchor id (occurrence-based) differs, but the fingerprint still matches.
    const newBlocks = [block("Đoạn không liên quan."), block("Đoạn hai.")];
    const oldFingerprint = fingerprintParagraph("Đoạn hai.");
    const staleAnchorId = "p_doesnotexist";

    const result = resolveResumeAnchor(
      staleAnchorId,
      oldFingerprint,
      0,
      1,
      newBlocks,
    );

    expect(result).toMatchObject({ method: "fingerprint", ordinal: 1 });
  });

  it("prefers the earlier paragraph when two fingerprint matches tie on distance", () => {
    const fp = fingerprintParagraph("Lặp lại.");
    // old ordinal 5, candidates at index 3 and 7 -> both distance 2, tie -> earlier (3) wins.
    const newBlocks = [
      block("a"),
      block("b"),
      block("c"),
      block("Lặp lại."),
      block("e"),
      block("f"),
      block("g"),
      block("Lặp lại."),
    ];

    const result = resolveResumeAnchor("p_stale", fp, 5, 10, newBlocks);

    expect(result).toMatchObject({ method: "fingerprint", ordinal: 3 });
  });

  it("falls back to ordinal ratio when no fingerprint survives", () => {
    const newBlocks = Array.from({ length: 10 }, (_, i) =>
      block(`Đoạn mới ${i}.`),
    );

    // old chapter had 20 paragraphs, reader was at ordinal 10 (halfway).
    const result = resolveResumeAnchor(
      "p_stale",
      "deadbeefdead",
      10,
      20,
      newBlocks,
    );

    expect(result).toMatchObject({ method: "ordinal", ordinal: 5 });
  });

  it("clamps the ordinal fallback into range and handles oldBlockCount=0", () => {
    const newBlocks = [block("only one")];

    const result = resolveResumeAnchor(
      "p_stale",
      "deadbeefdead",
      0,
      0,
      newBlocks,
    );

    expect(result).toMatchObject({ method: "ordinal", ordinal: 0 });
  });

  it("returns null when the new chapter has no blocks at all", () => {
    const result = resolveResumeAnchor("p_stale", "deadbeefdead", 0, 5, []);
    expect(result).toBeNull();
  });
});
