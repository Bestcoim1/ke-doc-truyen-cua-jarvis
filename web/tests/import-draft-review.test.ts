import { describe, expect, it } from "vitest";

import {
  applyReviewSubmission,
  normalizeImportDraft,
} from "../lib/import/draft-validation";
import {
  changeSectionType,
  deleteChapter,
  mergeChapterWithPrevious,
  moveChapter,
  moveSectionToParent,
  renameChapter,
  renameSection,
  reorderChapter,
  reorderSection,
  splitChapter,
  toReviewDraft,
  toStructure,
} from "../lib/import/review-draft";
import { parseStoryText } from "../lib/import/text-parser";

function createDraft() {
  return toReviewDraft(
    parseStoryText(
      `Hồi 1
Chương 1
Đoạn giống nhau.

Chương 2
Đoạn giống nhau.

Hồi 2
Chương 3
Đoạn cuối.`,
      { title: "Truyện test" },
    ),
  );
}

describe("import review draft operations", () => {
  it("renames sections and chapters", () => {
    const initial = createDraft();
    const sectionId = initial.sections[0].id;
    const chapterId = initial.sections[0].chapters[0].id;
    const renamed = renameChapter(
      renameSection(initial, sectionId, "Hồi mở đầu"),
      chapterId,
      "Chương mới",
    );

    expect(renamed.sections[0].title).toBe("Hồi mở đầu");
    expect(renamed.sections[0].chapters[0].title).toBe("Chương mới");
  });

  it("moves and deletes chapters while keeping stats current", () => {
    const initial = createDraft();
    const movedId = initial.sections[0].chapters[1].id;
    const targetId = initial.sections[1].id;
    const moved = moveChapter(initial, movedId, targetId);
    expect(moved.sections[1].chapters.at(-1)?.id).toBe(movedId);

    const deleted = deleteChapter(moved, movedId);
    expect(deleted.stats.chapterCount).toBe(initial.stats.chapterCount - 1);
  });

  it("moves leaf sections under a root section and back to the root", () => {
    const initial = createDraft();
    const parentId = initial.sections[0].id;
    const childId = initial.sections[1].id;

    const nested = moveSectionToParent(initial, childId, parentId);
    expect(nested.sections).toHaveLength(1);
    expect(nested.sections[0].children.map((section) => section.id)).toEqual([
      childId,
    ]);

    const restored = moveSectionToParent(nested, childId, null);
    expect(restored.sections.map((section) => section.id)).toEqual([
      parentId,
      childId,
    ]);
    expect(restored.sections[0].children).toHaveLength(0);
  });

  it("does not create a third section level or nest a section with children", () => {
    const initial = createDraft();
    const parentId = initial.sections[0].id;
    const childId = initial.sections[1].id;
    const nested = moveSectionToParent(initial, childId, parentId);

    expect(moveSectionToParent(nested, parentId, childId)).toBe(nested);
    expect(moveSectionToParent(nested, childId, childId)).toBe(nested);
  });

  it("merges into the previous reading-order chapter and rebuilds server content", () => {
    const initial = createDraft();
    const currentId = initial.sections[0].chapters[1].id;
    const merged = mergeChapterWithPrevious(initial, currentId);
    expect(merged.stats.chapterCount).toBe(initial.stats.chapterCount - 1);

    const materialized = normalizeImportDraft(merged);
    const chapter = materialized.sections[0].chapters[0];
    expect(chapter.contentText).toBe("Đoạn giống nhau.\n\nĐoạn giống nhau.");
    expect(chapter.blocks).toHaveLength(2);
    expect(chapter.blocks[1].anchor_id.endsWith("_1")).toBe(true);
  });

  it("changes a section's type, restricted to a single root chapter change", () => {
    const initial = createDraft();
    const changed = changeSectionType(
      initial,
      initial.sections[0].id,
      "volume",
    );
    expect(changed.sections[0].type).toBe("volume");
    expect(changed.sections[1].type).toBe("arc");
  });

  it("reorders chapters within a section and sections at the root", () => {
    const initial = createDraft();
    const firstChapterId = initial.sections[0].chapters[0].id;
    const secondChapterId = initial.sections[0].chapters[1].id;

    const movedDown = reorderChapter(initial, firstChapterId, "down");
    expect(movedDown.sections[0].chapters.map((c) => c.id)).toEqual([
      secondChapterId,
      firstChapterId,
    ]);
    // no-op at the boundary, not a crash
    expect(
      reorderChapter(
        movedDown,
        firstChapterId,
        "down",
      ).sections[0].chapters.map((c) => c.id),
    ).toEqual([secondChapterId, firstChapterId]);

    const firstSectionId = initial.sections[0].id;
    const secondSectionId = initial.sections[1].id;
    const reordered = reorderSection(initial, firstSectionId, "down");
    expect(reordered.sections.map((s) => s.id)).toEqual([
      secondSectionId,
      firstSectionId,
    ]);
  });

  it("splits a chapter at a paragraph boundary into two chapters", () => {
    const draft = toReviewDraft(
      parseStoryText(
        `Chương 1
Đoạn một.

Đoạn hai.

Đoạn ba.`,
        { title: "Truyện split" },
      ),
    );
    const chapterId = draft.sections[0].chapters[0].id;
    const split = splitChapter(draft, chapterId, 1, "chapter-split-test");

    expect(split.sections[0].chapters).toHaveLength(2);
    expect(split.sections[0].chapters[0].contentText).toBe("Đoạn một.");
    expect(split.sections[0].chapters[1].contentText).toBe(
      "Đoạn hai.\n\nĐoạn ba.",
    );
    expect(split.sections[0].chapters[1].id).toBe("chapter-split-test");
    expect(split.stats.chapterCount).toBe(draft.stats.chapterCount + 1);
  });

  it("round-trips through toStructure + applyReviewSubmission without resending content", () => {
    const initial = createDraft();
    const renamed = renameSection(
      initial,
      initial.sections[0].id,
      "Hồi mở đầu",
    );
    const structure = toStructure(renamed);

    // Nothing content-shaped survives in the structure payload.
    expect(JSON.stringify(structure)).not.toContain("Đoạn giống nhau");
    expect(JSON.stringify(structure)).not.toContain("contentHash");

    const rebuilt = applyReviewSubmission(initial, structure, []);
    expect(rebuilt.sections[0].title).toBe("Hồi mở đầu");
    expect(rebuilt.stats.chapterCount).toBe(initial.stats.chapterCount);
    expect(rebuilt.sections[0].chapters[0].contentText).toBe(
      "Đoạn giống nhau.",
    );
  });

  it("applies a split ContentOp server-side and reflects it in the rebuilt structure", () => {
    const initial = toReviewDraft(
      parseStoryText(
        `Chương 1
Đoạn một.

Đoạn hai.`,
        { title: "Truyện split server" },
      ),
    );
    const chapterId = initial.sections[0].chapters[0].id;
    const structure = toStructure(initial);
    // Insert the new chapter id right after the split source in structure —
    // mirrors what splitChapter does client-side.
    structure.sections[0].chapters.splice(1, 0, {
      id: "chapter-split-test",
      title: "Chương 1 (tiếp theo)",
      kind: "regular",
    });

    const rebuilt = applyReviewSubmission(initial, structure, [
      {
        type: "split",
        chapterId,
        blockIndex: 1,
        newChapterId: "chapter-split-test",
      },
    ]);

    expect(rebuilt.sections[0].chapters).toHaveLength(2);
    expect(rebuilt.sections[0].chapters[1].id).toBe("chapter-split-test");
    expect(rebuilt.sections[0].chapters[0].contentText).toBe("Đoạn một.");
    expect(rebuilt.sections[0].chapters[1].contentText).toBe("Đoạn hai.");
  });

  it("rejects applyReviewSubmission when structure references an unknown chapter id", () => {
    const initial = createDraft();
    const structure = toStructure(initial);
    structure.sections[0].chapters[0].id = "does-not-exist";

    expect(() => applyReviewSubmission(initial, structure, [])).toThrow();
  });
});
