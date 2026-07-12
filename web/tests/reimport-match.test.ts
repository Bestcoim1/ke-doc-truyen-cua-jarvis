import { describe, expect, it } from "vitest";

import { fingerprintParagraph } from "../lib/reader/anchors";
import {
  normalizeSourceSegment,
  parseStoryText,
  type DraftChapter,
  type DraftSection,
  type ImportDraft,
} from "../lib/import/text-parser";
import {
  matchChapters,
  matchSections,
  type OldChapterRef,
  type OldSectionRef,
} from "../lib/import/reimport-match";

/**
 * Builds the "old tree" refs a re-import matcher would receive from the DB,
 * by parsing text once and flattening it as if that draft had already been
 * committed — sourceKey/title/fingerprints come from the real parser/hash
 * pipeline, not hand-typed strings, so tests exercise the same normalization
 * the matcher relies on.
 */
function draftToOldRefs(draft: ImportDraft): { chapters: OldChapterRef[]; sections: OldSectionRef[] } {
  const chapters: OldChapterRef[] = [];
  const sections: OldSectionRef[] = [];
  let sortOrder = 0;

  function pathSegment(section: DraftSection): string {
    return `${section.type}:${normalizeSourceSegment(section.title)}`;
  }

  function walk(list: DraftSection[], parentId: string | null, parentPath: string | undefined) {
    for (const section of list) {
      sections.push({ id: section.id, parentSectionId: parentId, title: section.title, type: section.type });
      const path = parentPath ? `${parentPath}/${pathSegment(section)}` : pathSegment(section);

      for (const chapter of section.chapters) {
        chapters.push({
          id: chapter.id,
          sectionPath: path,
          title: chapter.title,
          sourceKey: chapter.sourceKey,
          sortOrder: sortOrder++,
          firstParagraphFingerprint: chapter.blocks[0] ? fingerprintParagraph(chapter.blocks[0].text) : null,
          lastParagraphFingerprint: chapter.blocks.at(-1) ? fingerprintParagraph(chapter.blocks.at(-1)!.text) : null,
        });
      }

      walk(section.children, section.id, path);
    }
  }

  walk(draft.sections, null, undefined);
  return { chapters, sections };
}

function findChapter(sections: DraftSection[], title: string): DraftChapter {
  for (const section of sections) {
    const found = section.chapters.find((c) => c.title === title) ?? findChapterOrUndefined(section.children, title);
    if (found) return found;
  }
  throw new Error(`chapter not found: ${title}`);
}
function findChapterOrUndefined(sections: DraftSection[], title: string): DraftChapter | undefined {
  for (const section of sections) {
    const found = section.chapters.find((c) => c.title === title);
    if (found) return found;
    const nested = findChapterOrUndefined(section.children, title);
    if (nested) return nested;
  }
  return undefined;
}

const SAMPLE = `Hồi 1
Chương 1
Nội dung chương một không đổi.

Chương 2
Nội dung chương hai sẽ được sửa.

Chương 3
Nội dung chương ba sẽ mất khỏi bản mới.`;

describe("matchChapters", () => {
  it("tier 1: matches unchanged chapters by exact source_key", () => {
    const oldDraft = parseStoryText(SAMPLE, { title: "T", sourceType: "paste" });
    const { chapters: oldRefs } = draftToOldRefs(oldDraft);
    // Re-parsing identical text yields identical sourceKeys (deterministic from title/path), new ids.
    const newDraft = parseStoryText(SAMPLE, { title: "T", sourceType: "paste" });

    const result = matchChapters(oldRefs, newDraft);

    expect(result.matches).toHaveLength(3);
    expect(result.matches.every((m) => m.tier === 1)).toBe(true);
    expect(result.unmatchedOld).toHaveLength(0);
    expect(result.unmatchedNew).toHaveLength(0);

    const ch1Match = result.matches.find(
      (m) => m.newChapterId === findChapter(newDraft.sections, "Chương 1").id,
    );
    expect(ch1Match?.oldChapterId).toBe(findChapter(oldDraft.sections, "Chương 1").id);
  });

  it("tier 2: falls back to title+position when the stored source_key no longer matches a fresh parse", () => {
    const text = `Hồi 1
Chương A
Nội dung A không đổi.`;

    const oldDraft = parseStoryText(text, { title: "T", sourceType: "paste" });
    const { chapters: oldRefsRaw } = draftToOldRefs(oldDraft);
    // Simulate a chapter whose stored source_key drifted from what a fresh
    // title-based parse would produce — e.g. it was created via a Slice-2
    // review split, which appends "#split" to sourceKey (draft-validation.ts
    // applyContentOps). Tier 1 (exact source_key) can no longer find it by
    // key; tier 2 (title + section path + occurrence order) still can,
    // recomputing the path fresh from the current title.
    const oldRefs = oldRefsRaw.map((ref) => ({ ...ref, sourceKey: `${ref.sourceKey}#split` }));
    const newDraft = parseStoryText(text, { title: "T", sourceType: "paste" });

    const result = matchChapters(oldRefs, newDraft);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ tier: 2 });
    expect(result.unmatchedOld).toHaveLength(0);
    expect(result.unmatchedNew).toHaveLength(0);
  });

  it("tier 3: matches by first/last paragraph fingerprint when the title itself changed", () => {
    const oldText = `Hồi 1
Chương 1
Đoạn mở đầu giống hệt cả hai bản.

Đoạn giữa sẽ đổi khác hoàn toàn ở bản mới.

Đoạn kết thúc giống hệt cả hai bản.`;
    const newText = `Hồi 1
Chương 9: Tên đã đổi hoàn toàn
Đoạn mở đầu giống hệt cả hai bản.

Đoạn giữa đã viết lại hoàn toàn khác so với bản gốc trước đó.

Đoạn kết thúc giống hệt cả hai bản.`;

    const oldDraft = parseStoryText(oldText, { title: "T", sourceType: "paste" });
    const { chapters: oldRefs } = draftToOldRefs(oldDraft);
    const newDraft = parseStoryText(newText, { title: "T", sourceType: "paste" });

    const result = matchChapters(oldRefs, newDraft);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ tier: 3 });
    expect(result.unmatchedOld).toHaveLength(0);
    expect(result.unmatchedNew).toHaveLength(0);
  });

  it("prefers tier 1 over tier 2/3 when multiple tiers would technically match", () => {
    const oldDraft = parseStoryText(SAMPLE, { title: "T", sourceType: "paste" });
    const { chapters: oldRefs } = draftToOldRefs(oldDraft);
    const newDraft = parseStoryText(SAMPLE, { title: "T", sourceType: "paste" });

    const result = matchChapters(oldRefs, newDraft);
    expect(result.matches.every((m) => m.tier === 1)).toBe(true);
  });

  it("leaves genuinely new and removed chapters unmatched", () => {
    const oldText = `Hồi 1
Chương 1
Nội dung chương một.

Chương 2
Nội dung chương hai, sẽ bị xoá khỏi bản mới.`;
    const newText = `Hồi 1
Chương 1
Nội dung chương một.

Chương 3
Nội dung chương ba, hoàn toàn mới.`;

    const oldDraft = parseStoryText(oldText, { title: "T", sourceType: "paste" });
    const { chapters: oldRefs } = draftToOldRefs(oldDraft);
    const newDraft = parseStoryText(newText, { title: "T", sourceType: "paste" });

    const result = matchChapters(oldRefs, newDraft);

    expect(result.matches).toHaveLength(1);
    expect(result.unmatchedOld).toHaveLength(1);
    expect(result.unmatchedOld[0].title).toBe("Chương 2");
    expect(result.unmatchedNew).toHaveLength(1);
    expect(result.unmatchedNew[0].title).toBe("Chương 3");
  });

  it("handles an empty old tree (first-ever import) and an empty new draft", () => {
    const draft = parseStoryText(SAMPLE, { title: "T", sourceType: "paste" });

    const emptyOldResult = matchChapters([], draft);
    expect(emptyOldResult.matches).toHaveLength(0);
    expect(emptyOldResult.unmatchedNew).toHaveLength(3);

    const { chapters: oldRefs } = draftToOldRefs(draft);
    const emptyNewDraft = parseStoryText("", { title: "T", sourceType: "paste" });
    const emptyNewResult = matchChapters(oldRefs, emptyNewDraft);
    expect(emptyNewResult.matches).toHaveLength(0);
    expect(emptyNewResult.unmatchedOld).toHaveLength(3);
  });
});

describe("matchSections", () => {
  it("matches sections by exact normalized (type, title, parent chain) path", () => {
    const oldDraft = parseStoryText(SAMPLE, { title: "T", sourceType: "paste" });
    const { sections: oldSections } = draftToOldRefs(oldDraft);
    const newDraft = parseStoryText(SAMPLE, { title: "T", sourceType: "paste" });

    const result = matchSections(oldSections, newDraft);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].oldSectionId).toBe(oldDraft.sections[0].id);
    expect(result.matches[0].newSectionId).toBe(newDraft.sections[0].id);
    expect(result.unmatchedOld).toHaveLength(0);
  });

  it("treats a renamed section as unmatched (no fuzzy matching)", () => {
    const oldDraft = parseStoryText(SAMPLE, { title: "T", sourceType: "paste" });
    const { sections: oldSections } = draftToOldRefs(oldDraft);
    const renamed = SAMPLE.replace("Hồi 1", "Hồi 1: Khởi đầu mới");
    const newDraft = parseStoryText(renamed, { title: "T", sourceType: "paste" });

    const result = matchSections(oldSections, newDraft);

    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedOld).toHaveLength(1);
  });
});
