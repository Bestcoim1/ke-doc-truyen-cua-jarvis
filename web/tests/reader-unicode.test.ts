import { describe, expect, it } from "vitest";

import {
  assignAnchorIds,
  fingerprintParagraph,
  hashContentBlocks,
  normalizeParagraphText,
} from "../lib/reader/anchors";

/**
 * Slice 4 WS4 — Vietnamese Unicode. PRD §10.2 normalizes to NFC before
 * hashing so a paragraph keeps its fingerprint across re-imports. Vietnamese
 * is the case that actually exercises this: the same word can arrive
 * precomposed (NFC, e.g. "ệ" = U+1EC7) or decomposed (NFD, e.g.
 * "e" + U+0302 + U+0323) depending on the source app. Without normalization
 * these are different byte strings and resume/re-import matching would break
 * silently on exactly the target language.
 */

const NFC = "Tôi yêu tiếng Việt — nhà văn viết bản thảo mỗi đêm khuya.";
const NFD = NFC.normalize("NFD");

describe("Vietnamese NFC/NFD equivalence", () => {
  it("the two forms really are byte-distinct before normalization", () => {
    expect(NFD).not.toBe(NFC);
    expect(NFD.length).toBeGreaterThan(NFC.length); // NFD splits diacritics out
  });

  it("normalizeParagraphText collapses both forms to the same NFC string", () => {
    expect(normalizeParagraphText(NFD)).toBe(normalizeParagraphText(NFC));
    expect(normalizeParagraphText(NFC)).toBe(NFC.normalize("NFC"));
  });

  it("fingerprints identically regardless of composition form", () => {
    expect(fingerprintParagraph(NFD)).toBe(fingerprintParagraph(NFC));
  });

  it("also folds surrounding whitespace differences on top of NFD", () => {
    expect(fingerprintParagraph(`  ${NFD}\n\n`)).toBe(
      fingerprintParagraph(NFC),
    );
  });
});

describe("anchor assignment on Vietnamese content", () => {
  it("treats NFC and NFD of the same paragraph as duplicates (occurrence suffix)", () => {
    const [first, second] = assignAnchorIds([{ text: NFC }, { text: NFD }]);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.anchorId).not.toBe(second.anchorId);
    expect(second.anchorId.endsWith("_1")).toBe(true);
  });

  it("keeps genuinely different Vietnamese paragraphs distinct", () => {
    const result = assignAnchorIds([
      { text: "Cô ấy mở cửa sổ nhìn ra con phố." },
      { text: "Cô ấy đóng cửa sổ rồi quay vào." },
    ]);
    expect(result[0].fingerprint).not.toBe(result[1].fingerprint);
  });
});

describe("chapter hash stability across composition form", () => {
  it("hashContentBlocks is identical for an NFC and an NFD rendering of a chapter", () => {
    const nfcChapter = [
      { text: NFC },
      { text: "Chương kế tiếp bắt đầu ở đây." },
    ];
    const nfdChapter = nfcChapter.map((b) => ({
      text: b.text.normalize("NFD"),
    }));
    expect(hashContentBlocks(nfdChapter)).toBe(hashContentBlocks(nfcChapter));
  });
});
