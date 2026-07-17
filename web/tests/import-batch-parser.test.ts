import { describe, expect, it } from "vitest";

import { mergeOrderedImportDrafts } from "../lib/import/batch-parser";
import { normalizeImportDraft } from "../lib/import/draft-validation";
import { parseStoryText } from "../lib/import/text-parser";

describe("mergeOrderedImportDrafts", () => {
  it("preserves file order and collapses adjacent synthetic sections", () => {
    const second = parseStoryText("Chương 2\nNội dung hai.", {
      title: "Tập hai",
      sourceType: "txt",
    });
    const first = parseStoryText("Chương 1\nNội dung một.", {
      title: "Tập một",
      sourceType: "txt",
    });

    const draft = mergeOrderedImportDrafts(
      [
        { filename: "02.txt", draft: second },
        { filename: "01.txt", draft: first },
      ],
      { title: "Truyện đã ghép" },
    );

    expect(draft.sourceType).toBe("batch");
    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0].chapters.map((chapter) => chapter.title)).toEqual([
      "Chương 2",
      "Chương 1",
    ]);
    expect(draft.sections[0].chapters[0].sourceKey).toContain(
      "batch/1/",
    );
    expect(draft.sections[0].chapters[1].sourceKey).toContain(
      "batch/2/",
    );
    expect(draft.stats).toMatchObject({ sectionCount: 1, chapterCount: 2 });
    expect(normalizeImportDraft(draft).sourceType).toBe("batch");
  });

  it("keeps real sections and labels warnings with their source file", () => {
    const first = parseStoryText("Hồi 1\nChương 1\nNội dung.", {
      title: "Một",
      sourceType: "txt",
    });
    const second = parseStoryText("Văn bản không có tiêu đề chương.", {
      title: "Hai",
      sourceType: "txt",
    });

    const draft = mergeOrderedImportDrafts(
      [
        { filename: "mot.txt", draft: first },
        { filename: "hai.txt", draft: second },
      ],
      { title: "Truyện", description: "Mô tả" },
    );

    expect(draft.sections.map((section) => section.title)).toEqual([
      "Hồi 1",
      "Chưa phân hồi",
    ]);
    expect(draft.title).toBe("Truyện");
    expect(draft.description).toBe("Mô tả");
    expect(draft.warnings.some((warning) => warning.startsWith("[2/2 · hai.txt]"))).toBe(
      true,
    );
  });

  it("rejects an empty batch", () => {
    expect(() =>
      mergeOrderedImportDrafts([], { title: "Truyện" }),
    ).toThrow("Cần ít nhất một file");
  });
});
