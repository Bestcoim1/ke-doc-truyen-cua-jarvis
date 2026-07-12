import { describe, expect, it } from "vitest";

import { normalizeImportDraft } from "../lib/import/draft-validation";
import {
  deleteChapter,
  mergeChapterWithPrevious,
  moveChapter,
  renameChapter,
  renameSection,
  toReviewDraft,
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
});
