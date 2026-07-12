import { assignAnchorIds } from "./anchors";
import type { Block } from "./types";

export type ResumeFallbackMethod = "exact" | "fingerprint" | "ordinal";

export type ResumeFallbackResult = {
  anchorId: string;
  fingerprint: string;
  ordinal: number;
  progressPct: number;
  method: ResumeFallbackMethod;
};

function toResult(
  assigned: (Block & { anchorId: string; fingerprint: string })[],
  index: number,
  method: ResumeFallbackMethod,
): ResumeFallbackResult {
  return {
    anchorId: assigned[index].anchorId,
    fingerprint: assigned[index].fingerprint,
    ordinal: index,
    progressPct: Math.round(((index + 1) / assigned.length) * 100),
    method,
  };
}

/**
 * PRD §10.2 resume fallback chain: exact anchor -> paragraph fingerprint
 * (nearest by ordinal distance, ties prefer the earlier paragraph) ->
 * ordinal ratio (last resort, telemetry-logged by the caller). Shared by
 * the re-import progress remap and (later) the reader's own live resume
 * handling — the algorithm doesn't care which triggered it, only that a
 * paragraph anchor observed against an old chapter revision needs to be
 * relocated in a new one.
 */
export function resolveResumeAnchor(
  oldAnchorId: string,
  oldFingerprint: string,
  oldOrdinal: number,
  oldBlockCount: number,
  newBlocks: Block[],
): ResumeFallbackResult | null {
  if (newBlocks.length === 0) return null;
  const assigned = assignAnchorIds(newBlocks);

  const exactIndex = assigned.findIndex((block) => block.anchorId === oldAnchorId);
  if (exactIndex !== -1) return toResult(assigned, exactIndex, "exact");

  const candidates = assigned
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.fingerprint === oldFingerprint);
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const distanceA = Math.abs(a.index - oldOrdinal);
      const distanceB = Math.abs(b.index - oldOrdinal);
      if (distanceA !== distanceB) return distanceA - distanceB;
      return a.index - b.index; // tie -> earlier paragraph wins (§10.2.4)
    });
    return toResult(assigned, candidates[0].index, "fingerprint");
  }

  const ratio = oldBlockCount > 0 ? oldOrdinal / oldBlockCount : 0;
  const ordinalIndex = Math.min(assigned.length - 1, Math.max(0, Math.round(ratio * assigned.length)));
  return toResult(assigned, ordinalIndex, "ordinal");
}
