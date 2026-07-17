import { describe, expect, it } from "vitest";

import { hashContentBlocks } from "../lib/reader/anchors";
import {
  classifyImportedHeading,
  parseStoryText,
} from "../lib/import/text-parser";

describe("parseStoryText", () => {
  it("parses Vietnamese Hồi and Chương headings and preserves hard line breaks", () => {
    const draft = parseStoryText(
      `Hồi I: Khởi đầu

Chương 1: Gặp gỡ

Dòng thứ nhất.
Dòng thứ hai vẫn cùng đoạn.

Đoạn thứ hai.`,
      { title: "Truyện thử", sourceType: "txt" },
    );

    expect(draft.title).toBe("Truyện thử");
    expect(draft.sourceType).toBe("txt");
    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]).toMatchObject({
      title: "Hồi I: Khởi đầu",
      type: "arc",
    });

    const chapter = draft.sections[0].chapters[0];
    expect(chapter).toMatchObject({
      title: "Chương 1: Gặp gỡ",
      kind: "regular",
      contentText:
        "Dòng thứ nhất.\nDòng thứ hai vẫn cùng đoạn.\n\nĐoạn thứ hai.",
    });
    expect(chapter.blocks.map((block) => block.text)).toEqual([
      "Dòng thứ nhất.\nDòng thứ hai vẫn cùng đoạn.",
      "Đoạn thứ hai.",
    ]);
    expect(chapter.blocks.every((block) => block.marks.length === 0)).toBe(
      true,
    );
    expect(chapter.contentHash).toBe(hashContentBlocks(chapter.blocks));
    expect(draft.stats).toMatchObject({ sectionCount: 1, chapterCount: 1 });
    expect(draft.stats.wordCount).toBe(chapter.wordCount);
    expect(draft.stats.characterCount).toBe(chapter.contentText.length);
  });

  it("puts chapters without a section into Chưa phân hồi", () => {
    const draft = parseStoryText(`Chương 1: Mở đầu
Nội dung một.
Chương II: Tiếp theo
Nội dung hai.`);

    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]).toMatchObject({
      title: "Chưa phân hồi",
      type: "arc",
    });
    expect(draft.sections[0].chapters).toHaveLength(2);
    expect(draft.stats.chapterCount).toBe(2);
    expect(
      draft.warnings.some((warning) => warning.includes("Chưa phân hồi")),
    ).toBe(true);
  });

  it("classifies Ngoại truyện chapters as extra", () => {
    const draft = parseStoryText(`Phần 1: Tuyển tập
Ngoại truyện: Ngày nghỉ
Nội dung A.
Ngoại truyện 2: Chuyến đi
Nội dung B.
Ngoại truyện gốc 3: Trở về
Nội dung C.`);

    expect(draft.sections[0].type).toBe("part");
    expect(
      draft.sections[0].chapters.map(({ title, kind }) => ({ title, kind })),
    ).toEqual([
      { title: "Ngoại truyện: Ngày nghỉ", kind: "extra" },
      { title: "Ngoại truyện 2: Chuyến đi", kind: "extra" },
      { title: "Ngoại truyện gốc 3: Trở về", kind: "extra" },
    ]);
  });

  it("parses English section and chapter aliases", () => {
    const draft = parseStoryText(`Volume I: Opening
Chapter 1: First
First content.
Chap II: Second
Second content.
Extra 3: Bonus
Bonus content.
Side Story 4: Holiday
Holiday content.`);

    expect(draft.sections[0].type).toBe("volume");
    expect(draft.sections[0].chapters.map((chapter) => chapter.kind)).toEqual([
      "regular",
      "regular",
      "extra",
      "extra",
    ]);
    expect(draft.stats.chapterCount).toBe(4);
  });

  it("creates scene-break blocks for supported standalone markers", () => {
    const draft = parseStoryText(`Chương 1
Đoạn đầu.
***
* * *
—
---
Đoạn cuối.`);
    const chapter = draft.sections[0].chapters[0];

    expect(chapter.blocks.map((block) => [block.type, block.text])).toEqual([
      ["paragraph", "Đoạn đầu."],
      ["scene_break", "***"],
      ["scene_break", "* * *"],
      ["scene_break", "—"],
      ["scene_break", "---"],
      ["paragraph", "Đoạn cuối."],
    ]);
    expect(
      chapter.blocks.every((block) => block.anchor_id.startsWith("p_")),
    ).toBe(true);
    expect(chapter.wordCount).toBe(4);
    expect(chapter.contentHash).toBe(hashContentBlocks(chapter.blocks));
  });

  it("keeps prose without a chapter heading as a temporary chapter", () => {
    const draft = parseStoryText(`Đoạn văn đầu tiên.

Đoạn văn thứ hai.`);

    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]).toMatchObject({
      title: "Chưa phân hồi",
      type: "arc",
    });
    expect(draft.sections[0].chapters).toHaveLength(1);
    expect(draft.sections[0].chapters[0]).toMatchObject({
      title: "Chương chưa đặt tên",
      kind: "regular",
      contentText: "Đoạn văn đầu tiên.\n\nĐoạn văn thứ hai.",
    });
    expect(
      draft.warnings.some((warning) =>
        warning.includes("Không tìm thấy tiêu đề chương"),
      ),
    ).toBe(true);
  });

  it("creates a chapter from direct content under a section", () => {
    const draft = parseStoryText(`Arc 1: Khởi đầu
Nội dung không có heading chương.`);

    expect(draft.sections[0]).toMatchObject({
      title: "Arc 1: Khởi đầu",
      type: "arc",
    });
    expect(draft.sections[0].chapters[0]).toMatchObject({
      title: "Arc 1: Khởi đầu",
      kind: "regular",
      contentText: "Nội dung không có heading chương.",
    });
  });

  it("keeps paragraph anchors, hashes, and source keys stable for the same input", () => {
    const source = `Chương 1: Ổn định
Đoạn lặp lại.

Đoạn khác.

Đoạn lặp lại.`;
    const first = parseStoryText(source);
    const second = parseStoryText(source);
    const firstChapter = first.sections[0].chapters[0];
    const secondChapter = second.sections[0].chapters[0];

    expect(firstChapter.blocks.map((block) => block.anchor_id)).toEqual(
      secondChapter.blocks.map((block) => block.anchor_id),
    );
    expect(firstChapter.blocks[2].anchor_id.endsWith("_1")).toBe(true);
    expect(firstChapter.contentHash).toBe(secondChapter.contentHash);
    expect(firstChapter.sourceKey).toBe(secondChapter.sourceKey);
  });

  it("supports Volume children while allowing chapters directly on a Volume", () => {
    const draft = parseStoryText(`Quyển 1
Chương 1
Nội dung trực tiếp.
Hồi 1
Chương 2
Nội dung trong hồi.`);

    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]).toMatchObject({
      type: "volume",
      title: "Quyển 1",
    });
    expect(draft.sections[0].chapters).toHaveLength(1);
    expect(draft.sections[0].children).toHaveLength(1);
    expect(draft.sections[0].children[0]).toMatchObject({
      type: "arc",
      title: "Hồi 1",
    });
    expect(draft.sections[0].children[0].chapters).toHaveLength(1);
    expect(draft.stats).toMatchObject({ sectionCount: 2, chapterCount: 2 });
  });
});

describe("classifyImportedHeading", () => {
  it("keeps the legacy Roman-number guard against prose false positives", () => {
    expect(classifyImportedHeading("Chapter Introduction")).toBeNull();
    expect(classifyImportedHeading("Chapter CIVIL War")).toBeNull();
    expect(classifyImportedHeading("Volume CIVIL War")).toBeNull();
    expect(classifyImportedHeading("Side Story 2: Holiday")).toBe("chapter");
  });
});
