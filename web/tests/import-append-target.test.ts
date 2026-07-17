import { describe, expect, it } from "vitest";

import {
  appendTargetPath,
  orderAppendSectionOptions,
  retargetAppendDraft,
  savedAppendSectionMatches,
  type ExistingAppendSection,
} from "../lib/import/append-target";
import { parseStoryText } from "../lib/import/text-parser";

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";

const sections: ExistingAppendSection[] = [
  {
    id: CHILD_ID,
    parentSectionId: ROOT_ID,
    title: "Ngoại truyện",
    type: "part",
    sortOrder: 2,
  },
  {
    id: ROOT_ID,
    parentSectionId: null,
    title: "Phần chính",
    type: "arc",
    sortOrder: 0,
  },
];

describe("append target sections", () => {
  it("orders existing sections as a selectable tree", () => {
    expect(
      orderAppendSectionOptions(sections).map(({ id, depth }) => ({ id, depth })),
    ).toEqual([
      { id: ROOT_ID, depth: 0 },
      { id: CHILD_ID, depth: 1 },
    ]);
  });

  it("flattens all uploaded chapters into the chosen existing section", () => {
    const draft = parseStoryText(
      "Hồi mới\nChương 30\nNội dung 30.\nChương 31\nNội dung 31.",
      { title: "Truyện", sourceType: "txt" },
    );
    const result = retargetAppendDraft(
      draft,
      appendTargetPath(sections, CHILD_ID),
    );

    expect(result.draft.sections).toHaveLength(1);
    expect(result.draft.sections[0].title).toBe("Phần chính");
    expect(result.draft.sections[0].chapters).toHaveLength(0);
    expect(result.draft.sections[0].children[0].title).toBe("Ngoại truyện");
    expect(
      result.draft.sections[0].children[0].chapters.map((chapter) => chapter.title),
    ).toEqual(["Chương 30", "Chương 31"]);
    expect(result.sectionMatches.map((match) => match.oldSectionId)).toEqual([
      ROOT_ID,
      CHILD_ID,
    ]);
    expect(result.draft.stats.chapterCount).toBe(2);
  });

  it("distinguishes an explicit create-new choice from an old job", () => {
    expect(savedAppendSectionMatches({ version: 1, sections: [] })).toEqual([]);
    expect(savedAppendSectionMatches({ version: 1 })).toBeNull();
    expect(
      savedAppendSectionMatches({
        sections: [
          {
            newSectionId: "33333333-3333-4333-8333-333333333333",
            oldSectionId: ROOT_ID,
          },
        ],
      }),
    ).toHaveLength(1);
  });
});
