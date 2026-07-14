import type { ChapterMatch, OldChapterRef } from "./reimport-match";

/**
 * A reviewer's explicit choice for an old chapter, overriding auto-match.
 * `unrelated` covers a partial re-import (e.g. importing one new Arc as its
 * own file rather than the whole manuscript): the old chapter isn't
 * addressed by this re-import at all and must be left exactly as it is —
 * distinct from `archived` (hides it) and from mapping it to a new chapter
 * (which would fold/overwrite its content). Before this existed, the only
 * way past the "every chapter needs a disposition" gate for such a chapter
 * was to archive it or wrongly map it onto an unrelated new chapter,
 * silently discarding its content.
 */
export type ManualOverride =
  { newChapterId: string } | { archived: true } | { unrelated: true };

/** Mirrors the "decisions" entries commit_reimport_job expects in mapping_json (migration 0008, kind list extended in 0009). */
export type Decision =
  | { kind: "primary"; newChapterId: string; oldChapterId: string }
  | { kind: "merged"; newChapterId: string; oldChapterId: string }
  | { kind: "archived"; oldChapterId: string }
  | { kind: "unrelated"; oldChapterId: string };

/**
 * Resolves every old chapter's final disposition: manual override wins
 * over auto-match; a manual override pointing at a new chapter id that no
 * longer exists in the current draft (deleted/merged/split away by a
 * structural edit) is silently dropped back to unresolved rather than
 * crashing or emitting a dangling reference — the RPC would reject it
 * anyway (KD004), so failing softly here just means the reviewer sees it
 * back in the "needs confirmation" list.
 *
 * Injectivity (one primary claim per new chapter, everything else that
 * targets it becomes "merged") is enforced here purely so the UI/summary
 * reflects reality — commit_reimport_job re-derives and re-validates this
 * independently server-side (see migration 0008's header comment), so a
 * bug here can't itself corrupt data, only mislabel a preview.
 */
export function computeFinalDecisions(
  oldChapters: OldChapterRef[],
  autoMatches: ChapterMatch[],
  manualOverrides: Record<string, ManualOverride>,
  currentNewChapterIds: Set<string>,
): { decisions: Decision[]; unresolvedOld: OldChapterRef[] } {
  const decisions: Decision[] = [];
  const unresolvedOld: OldChapterRef[] = [];
  const claimedNewChapterIds = new Set<string>();

  for (const old of oldChapters) {
    const manual = manualOverrides[old.id];

    if (manual && "archived" in manual) {
      decisions.push({ kind: "archived", oldChapterId: old.id });
      continue;
    }

    if (manual && "unrelated" in manual) {
      decisions.push({ kind: "unrelated", oldChapterId: old.id });
      continue;
    }

    const targetNewChapterId =
      manual?.newChapterId ??
      autoMatches.find((match) => match.oldChapterId === old.id)?.newChapterId;

    if (!targetNewChapterId || !currentNewChapterIds.has(targetNewChapterId)) {
      unresolvedOld.push(old);
      continue;
    }

    const kind = claimedNewChapterIds.has(targetNewChapterId)
      ? "merged"
      : "primary";
    claimedNewChapterIds.add(targetNewChapterId);
    decisions.push({
      kind,
      newChapterId: targetNewChapterId,
      oldChapterId: old.id,
    });
  }

  return { decisions, unresolvedOld };
}
