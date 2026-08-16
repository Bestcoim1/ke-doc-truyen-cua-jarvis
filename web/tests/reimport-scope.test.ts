import { describe, expect, it } from "vitest";

import type { ExistingAppendSection } from "../lib/import/append-target";
import type { OldChapterRef, OldSectionRef } from "../lib/import/reimport-match";
import {
  buildScopedInitialOverrides,
  oldChapterIdsInScope,
  parseReimportUpdateScope,
  prepareScopedUpdateDraft,
  reimportUpdateScopeFromMapping,
  sameReimportUpdateScope,
} from "../lib/import/reimport-scope";
import { parseStoryText } from "../lib/import/text-parser";

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CHAPTER_ID = "44444444-4444-4444-8444-444444444444";

const path: ExistingAppendSection[] = [
  {
    id: ROOT_ID,
    parentSectionId: null,
    title: "Arc I",
    type: "arc",
    sortOrder: 0,
  },
  {
    id: CHILD_ID,
    parentSectionId: ROOT_ID,
    title: "Hồi mở đầu",
    type: "part",
    sortOrder: 0,
  },
];

const sections: OldSectionRef[] = path.map((section) => ({
  id: section.id,
  parentSectionId: section.parentSectionId,
  title: section.title,
  type: section.type,
}));

function oldChapter(id: string, sectionId: string): OldChapterRef {
  return {
    id,
    sectionId,
    sectionPath: "arc:arc%20i/part:h%E1%BB%93i%20m%E1%BB%9F%20%C4%91%E1%BA%A7u",
    title: id,
    sourceKey: id,
    sortOrder: 0,
    firstParagraphFingerprint: null,
    lastParagraphFingerprint: null,
  };
}

describe("re-import update scope", () => {
  it("requires a valid target for precise chapter or section updates", () => {
    expect(parseReimportUpdateScope("chapter", CHAPTER_ID)).toEqual({
      kind: "chapter",
      targetId: CHAPTER_ID,
    });
    expect(() => parseReimportUpdateScope("chapter", "not-an-id")).toThrow(
      /Hãy chọn/u,
    );
  });

  it("keeps legacy mappings scoped to the whole story", () => {
    expect(reimportUpdateScopeFromMapping({ decisions: [] })).toEqual({
      kind: "story",
    });
    expect(
      reimportUpdateScopeFromMapping({
        scope: { kind: "section", targetId: CHILD_ID },
      }),
    ).toEqual({ kind: "section", targetId: CHILD_ID });
  });

  it("compares scope identity without trusting labels or other mapping data", () => {
    expect(
      sameReimportUpdateScope(
        { kind: "chapter", targetId: CHAPTER_ID },
        { kind: "chapter", targetId: CHAPTER_ID },
      ),
    ).toBe(true);
    expect(
      sameReimportUpdateScope(
        { kind: "chapter", targetId: CHAPTER_ID },
        { kind: "section", targetId: CHAPTER_ID },
      ),
    ).toBe(false);
  });

  it("retargets one parsed chapter to the selected identity and section path", () => {
    const draft = parseStoryText("Nội dung mới của chương.", {
      title: "Truyện",
      sourceType: "paste",
    });
    const prepared = prepareScopedUpdateDraft(draft, {
      kind: "chapter",
      scope: { kind: "chapter", targetId: CHAPTER_ID },
      path,
      chapter: {
        title: "Chương 12: Trở về",
        kind: "regular",
        sourceKey: "old-source-key",
      },
    });

    const leaf = prepared.draft.sections[0].children[0];
    expect(leaf.title).toBe("Hồi mở đầu");
    expect(leaf.chapters).toHaveLength(1);
    expect(leaf.chapters[0]).toMatchObject({
      title: "Chương 12: Trở về",
      sourceKey: "old-source-key",
    });
    expect(prepared.sectionMatches.map((match) => match.oldSectionId)).toEqual([
      ROOT_ID,
      CHILD_ID,
    ]);
  });

  it("rejects a multi-chapter source when one chapter was selected", () => {
    const draft = parseStoryText(
      "Chương 1\nMột.\n\nChương 2\nHai.",
      { title: "Truyện" },
    );
    expect(() =>
      prepareScopedUpdateDraft(draft, {
        kind: "chapter",
        scope: { kind: "chapter", targetId: CHAPTER_ID },
        path,
        chapter: {
          title: "Chương 1",
          kind: "regular",
          sourceKey: null,
        },
      }),
    ).toThrow(/chứa 2 chương/u);
  });

  it("pins one imported root section to the selected arc with a stable UUID", () => {
    const draft = parseStoryText("Arc mới\nChương 1\nNội dung.", {
      title: "Truyện",
    });
    const prepared = prepareScopedUpdateDraft(draft, {
      kind: "section",
      scope: { kind: "section", targetId: ROOT_ID },
      path: [path[0]],
    });
    expect(prepared.draft.sections[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(prepared.sectionMatches).toEqual([
      {
        newSectionId: prepared.draft.sections[0].id,
        oldSectionId: ROOT_ID,
      },
    ]);
  });

  it("marks every chapter outside a selected subtree as unrelated", () => {
    const oldChapters = [
      oldChapter(CHAPTER_ID, CHILD_ID),
      oldChapter(OTHER_CHAPTER_ID, "55555555-5555-4555-8555-555555555555"),
    ];
    expect(
      [...oldChapterIdsInScope(
        { kind: "section", targetId: ROOT_ID },
        oldChapters,
        sections,
      )],
    ).toEqual([CHAPTER_ID]);
    expect(
      buildScopedInitialOverrides(
        { kind: "section", targetId: ROOT_ID },
        oldChapters,
        sections,
        ["new-1"],
      ),
    ).toEqual({ [OTHER_CHAPTER_ID]: { unrelated: true } });
  });

  it("maps a selected chapter directly and leaves all others unrelated", () => {
    const oldChapters = [
      oldChapter(CHAPTER_ID, CHILD_ID),
      oldChapter(OTHER_CHAPTER_ID, CHILD_ID),
    ];
    expect(
      buildScopedInitialOverrides(
        { kind: "chapter", targetId: CHAPTER_ID },
        oldChapters,
        sections,
        ["new-chapter"],
      ),
    ).toEqual({
      [CHAPTER_ID]: { newChapterId: "new-chapter" },
      [OTHER_CHAPTER_ID]: { unrelated: true },
    });
  });
});
