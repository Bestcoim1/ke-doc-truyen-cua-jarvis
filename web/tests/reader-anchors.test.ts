import { describe, expect, it } from "vitest";

import {
  assignAnchorIds,
  buildAnchorId,
  extractFingerprintFromAnchorId,
  fingerprintParagraph,
  hashContentBlocks,
  normalizeParagraphText,
} from "../lib/reader/anchors";

describe("normalizeParagraphText", () => {
  it("collapses internal whitespace and trims", () => {
    expect(normalizeParagraphText("  Xin   chào\n\nthế giới  ")).toBe(
      "Xin chào thế giới",
    );
  });
});

describe("fingerprintParagraph", () => {
  it("is deterministic for the same normalized text", () => {
    expect(fingerprintParagraph("Xin chào")).toBe(
      fingerprintParagraph("  Xin   chào  "),
    );
  });

  it("differs for different text", () => {
    expect(fingerprintParagraph("Xin chào")).not.toBe(
      fingerprintParagraph("Tạm biệt"),
    );
  });
});

describe("buildAnchorId", () => {
  it("has no suffix for the first occurrence", () => {
    expect(buildAnchorId("abc123", 0)).toBe("p_abc123");
  });

  it("suffixes repeated occurrences", () => {
    expect(buildAnchorId("abc123", 1)).toBe("p_abc123_1");
  });
});

describe("assignAnchorIds", () => {
  it("gives duplicate paragraphs distinct anchor ids via occurrence suffix", () => {
    const blocks = [{ text: "Lặp lại" }, { text: "Khác" }, { text: "Lặp lại" }];
    const result = assignAnchorIds(blocks);
    expect(result[0].anchorId).not.toBe(result[2].anchorId);
    expect(result[0].fingerprint).toBe(result[2].fingerprint);
    expect(result[2].anchorId.endsWith("_1")).toBe(true);
  });
});

describe("extractFingerprintFromAnchorId", () => {
  it("round-trips through buildAnchorId for both suffixed and unsuffixed ids", () => {
    expect(extractFingerprintFromAnchorId(buildAnchorId("abc123", 0))).toBe(
      "abc123",
    );
    expect(extractFingerprintFromAnchorId(buildAnchorId("abc123", 3))).toBe(
      "abc123",
    );
  });
});

describe("hashContentBlocks", () => {
  it("is stable for equivalent content and changes when content changes", () => {
    const a = hashContentBlocks([{ text: "Một" }, { text: "Hai" }]);
    const b = hashContentBlocks([{ text: "Một" }, { text: "Hai" }]);
    const c = hashContentBlocks([{ text: "Một" }, { text: "Ba" }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
