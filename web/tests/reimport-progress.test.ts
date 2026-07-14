import { describe, expect, it } from "vitest";

import {
  parseChapterIdPairs,
  resolveRemapTarget,
  type ChapterIdPair,
} from "../lib/import/reimport-progress";

describe("parseChapterIdPairs", () => {
  it("returns an empty array for non-array input", () => {
    expect(parseChapterIdPairs(null)).toEqual([]);
    expect(parseChapterIdPairs(undefined)).toEqual([]);
    expect(parseChapterIdPairs("not an array")).toEqual([]);
  });

  it("filters out malformed entries", () => {
    const raw = [
      { oldChapterId: "a", newChapterId: "b" },
      { oldChapterId: "missing-new" },
      null,
      "garbage",
    ];
    expect(parseChapterIdPairs(raw)).toEqual([
      { oldChapterId: "a", newChapterId: "b" },
    ]);
  });
});

describe("resolveRemapTarget", () => {
  it("resolves a directly matched (unmerged) chapter to itself", () => {
    const pairs: ChapterIdPair[] = [
      {
        oldChapterId: "c1",
        newChapterId: "draft-1",
        oldRevisionId: "r1",
        newRevisionId: "r2",
        contentChanged: true,
      },
    ];

    const target = resolveRemapTarget(pairs, "c1");

    expect(target).toEqual({
      oldRevisionId: "r1",
      targetChapterId: "c1",
      targetRevisionId: "r2",
    });
  });

  it("chases a merged chapter through to its primary's real chapter/revision id", () => {
    const pairs: ChapterIdPair[] = [
      {
        oldChapterId: "primary-old",
        newChapterId: "draft-1",
        oldRevisionId: "r-primary",
        newRevisionId: "r-new",
        contentChanged: true,
      },
      {
        oldChapterId: "merged-old",
        newChapterId: "draft-1",
        oldRevisionId: "r-merged",
        newRevisionId: null,
        contentChanged: true,
        merged: true,
      },
    ];

    // The user's progress was on the chapter that got merged away.
    const target = resolveRemapTarget(pairs, "merged-old");

    expect(target).toEqual({
      oldRevisionId: "r-merged",
      targetChapterId: "primary-old",
      targetRevisionId: "r-new",
    });
  });

  it("returns null when the chapter isn't in the pairs at all (untouched by this re-import)", () => {
    const pairs: ChapterIdPair[] = [
      {
        oldChapterId: "c1",
        newChapterId: "draft-1",
        oldRevisionId: "r1",
        newRevisionId: "r2",
        contentChanged: true,
      },
    ];

    expect(resolveRemapTarget(pairs, "unrelated-chapter")).toBeNull();
  });

  it("returns null when a merged entry's primary is missing from the pairs (defensive)", () => {
    const pairs: ChapterIdPair[] = [
      {
        oldChapterId: "merged-old",
        newChapterId: "draft-1",
        oldRevisionId: "r-merged",
        newRevisionId: null,
        contentChanged: true,
        merged: true,
      },
    ];

    expect(resolveRemapTarget(pairs, "merged-old")).toBeNull();
  });
});
