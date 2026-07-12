import { describe, expect, it } from "vitest";

import { computeFinalDecisions } from "../lib/import/reimport-decisions";
import type { OldChapterRef, ChapterMatch } from "../lib/import/reimport-match";

function oldRef(id: string, title = id): OldChapterRef {
  return {
    id,
    sectionPath: "arc:hồi 1",
    title,
    sourceKey: `arc:hồi 1/regular:${title}`,
    sortOrder: 0,
    firstParagraphFingerprint: null,
    lastParagraphFingerprint: null,
  };
}

describe("computeFinalDecisions", () => {
  it("uses the auto-match as a primary decision when no manual override exists", () => {
    const oldChapters = [oldRef("old-1")];
    const autoMatches: ChapterMatch[] = [{ oldChapterId: "old-1", newChapterId: "new-1", tier: 1, reason: "x" }];

    const { decisions, unresolvedOld } = computeFinalDecisions(oldChapters, autoMatches, {}, new Set(["new-1"]));

    expect(decisions).toEqual([{ kind: "primary", newChapterId: "new-1", oldChapterId: "old-1" }]);
    expect(unresolvedOld).toHaveLength(0);
  });

  it("lets a manual override replace an auto-match", () => {
    const oldChapters = [oldRef("old-1")];
    const autoMatches: ChapterMatch[] = [{ oldChapterId: "old-1", newChapterId: "new-1", tier: 1, reason: "x" }];

    const { decisions } = computeFinalDecisions(
      oldChapters,
      autoMatches,
      { "old-1": { newChapterId: "new-2" } },
      new Set(["new-1", "new-2"]),
    );

    expect(decisions).toEqual([{ kind: "primary", newChapterId: "new-2", oldChapterId: "old-1" }]);
  });

  it("marks an explicit archive decision", () => {
    const oldChapters = [oldRef("old-1")];
    const { decisions, unresolvedOld } = computeFinalDecisions(
      oldChapters,
      [],
      { "old-1": { archived: true } },
      new Set(),
    );

    expect(decisions).toEqual([{ kind: "archived", oldChapterId: "old-1" }]);
    expect(unresolvedOld).toHaveLength(0);
  });

  it("leaves an old chapter with no match and no override unresolved", () => {
    const oldChapters = [oldRef("old-1")];
    const { decisions, unresolvedOld } = computeFinalDecisions(oldChapters, [], {}, new Set());

    expect(decisions).toHaveLength(0);
    expect(unresolvedOld).toEqual(oldChapters);
  });

  it("turns a second claim on the same new chapter into a merge, preserving injectivity", () => {
    const oldChapters = [oldRef("old-1"), oldRef("old-2")];
    const manualOverrides = {
      "old-1": { newChapterId: "new-1" },
      "old-2": { newChapterId: "new-1" },
    };

    const { decisions } = computeFinalDecisions(oldChapters, [], manualOverrides, new Set(["new-1"]));

    expect(decisions).toEqual([
      { kind: "primary", newChapterId: "new-1", oldChapterId: "old-1" },
      { kind: "merged", newChapterId: "new-1", oldChapterId: "old-2" },
    ]);
  });

  it("drops a manual override that targets a chapter no longer in the current draft, falling back to unresolved", () => {
    const oldChapters = [oldRef("old-1")];
    const manualOverrides = { "old-1": { newChapterId: "new-deleted-by-merge" } };

    const { decisions, unresolvedOld } = computeFinalDecisions(
      oldChapters,
      [],
      manualOverrides,
      new Set(["new-1"]), // "new-deleted-by-merge" no longer exists
    );

    expect(decisions).toHaveLength(0);
    expect(unresolvedOld).toEqual(oldChapters);
  });
});
