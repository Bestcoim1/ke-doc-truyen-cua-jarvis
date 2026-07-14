import { describe, expect, it } from "vitest";

import { assignAnchorIds, hashContentBlocks } from "../lib/reader/anchors";
import {
  buildFlatChapterList,
  buildTocTree,
  type ChapterRow,
  type SectionRow,
} from "../lib/reader/tree";

/**
 * Slice 4 WS4 — long-story scaling. These are the data-layer transforms on
 * the reader's hot path at the fixture's target extremes (500 chapters; a
 * ~100k-character chapter). They double as a regression tripwire: the
 * elapsed-time ceilings are deliberately loose (they only trip on a
 * catastrophic algorithmic regression, e.g. an accidental O(n^2)), not a
 * fine-grained budget — 500 items is genuinely small for O(n) work, so the
 * real value here is asserting correctness *at scale* plus a floor under
 * which we know virtualization is unnecessary. The DOM/observer cost that
 * virtualization would actually address is measured on-device; see
 * docs/slice4-longstory.md.
 */

// 10 volumes x 5 arcs x 10 chapters = 500 chapters, 60 sections, depth 2.
function buildLargeStory(): { sections: SectionRow[]; chapters: ChapterRow[] } {
  const sections: SectionRow[] = [];
  const chapters: ChapterRow[] = [];
  let chapterCounter = 0;

  for (let v = 0; v < 10; v += 1) {
    const volumeId = `vol-${v}`;
    sections.push({
      id: volumeId,
      parent_section_id: null,
      title: `Quyển ${v + 1}`,
      sort_order: v,
    });

    for (let a = 0; a < 5; a += 1) {
      const arcId = `arc-${v}-${a}`;
      sections.push({
        id: arcId,
        parent_section_id: volumeId,
        title: `Hồi ${a + 1}`,
        sort_order: a,
      });

      for (let c = 0; c < 10; c += 1) {
        chapters.push({
          id: `ch-${chapterCounter}`,
          section_id: arcId,
          title: `Chương ${chapterCounter + 1}`,
          sort_order: c,
          current_revision_id: `rev-${chapterCounter}`,
        });
        chapterCounter += 1;
      }
    }
  }

  return { sections, chapters };
}

describe("TOC transforms at 500 chapters", () => {
  it("flattens every chapter with a correct 2-level section path", () => {
    const { sections, chapters } = buildLargeStory();

    const start = performance.now();
    const flat = buildFlatChapterList(sections, chapters);
    const tree = buildTocTree(sections, chapters);
    const elapsed = performance.now() - start;

    expect(flat).toHaveLength(500);
    // Reading order is preserved: sortKey is dense and monotonic.
    expect(flat.map((entry) => entry.sortKey)).toEqual(flat.map((_, i) => i));
    // Every chapter sits under Quyển N / Hồi M.
    expect(flat[0].sectionPath).toEqual(["Quyển 1", "Hồi 1"]);
    expect(flat.at(-1)!.sectionPath).toEqual(["Quyển 10", "Hồi 5"]);
    // 10 root volumes, each with 5 arc children.
    expect(tree).toHaveLength(10);
    expect(
      tree.every(
        (node) => node.kind === "section" && node.children.length === 5,
      ),
    ).toBe(true);

    // Catastrophic-regression tripwire only (see file header).
    expect(elapsed).toBeLessThan(500);
  });
});

describe("chapter content transforms at ~100k characters", () => {
  it("assigns a unique anchor per paragraph and hashes the whole chapter", () => {
    // ~800 paragraphs of ~130 chars each ≈ 100k characters, mirroring the
    // seed fixture's long-chapter edge case.
    const paragraphs = Array.from({ length: 800 }, (_, i) => ({
      text:
        `Đoạn văn số ${i + 1}. ` +
        "Câu văn tiếng Việt có dấu để kiểm thử độ dài. ".repeat(3),
    }));
    const totalChars = paragraphs.reduce((sum, p) => sum + p.text.length, 0);
    expect(totalChars).toBeGreaterThan(100_000);

    const start = performance.now();
    const assigned = assignAnchorIds(paragraphs);
    const hash = hashContentBlocks(paragraphs);
    const elapsed = performance.now() - start;

    // Distinct text per paragraph → every anchor id is unique.
    expect(new Set(assigned.map((b) => b.anchorId)).size).toBe(800);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    expect(elapsed).toBeLessThan(500);
  });
});
