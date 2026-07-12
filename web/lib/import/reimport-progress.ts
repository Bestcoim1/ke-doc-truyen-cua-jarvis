import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";
import { getChapterRevisionContent } from "../reader/queries";
import { resolveResumeAnchor } from "../reader/resume-fallback";
import { logEvent } from "../telemetry";

/** Mirrors one entry of commit_reimport_job's chapter_id_pairs return value (migration 0008). */
export type ChapterIdPair = {
  oldChapterId: string;
  newChapterId: string;
  oldRevisionId: string | null;
  newRevisionId: string | null;
  contentChanged: boolean;
  merged?: boolean;
};

export function parseChapterIdPairs(raw: unknown): ChapterIdPair[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is ChapterIdPair =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as ChapterIdPair).oldChapterId === "string" &&
      typeof (entry as ChapterIdPair).newChapterId === "string",
  );
}

/**
 * A "merged" pair has no revision of its own to point at — its content
 * folded into whichever chapter claimed "primary" on the same newChapterId
 * (draft-side id). Chases that one level to find the real target: the DB
 * chapter id is stable across a match (reused, never regenerated), so the
 * primary pair's own oldChapterId *is* the current DB chapter id.
 */
export function resolveRemapTarget(
  pairs: ChapterIdPair[],
  oldChapterId: string,
): { oldRevisionId: string | null; targetChapterId: string; targetRevisionId: string | null } | null {
  const direct = pairs.find((pair) => pair.oldChapterId === oldChapterId);
  if (!direct) return null;

  if (!direct.merged) {
    return { oldRevisionId: direct.oldRevisionId, targetChapterId: direct.oldChapterId, targetRevisionId: direct.newRevisionId };
  }

  const primary = pairs.find((pair) => !pair.merged && pair.newChapterId === direct.newChapterId);
  if (!primary) return null;
  return { oldRevisionId: direct.oldRevisionId, targetChapterId: primary.oldChapterId, targetRevisionId: primary.newRevisionId };
}

/**
 * Best-effort, never blocks the caller: runs after commit_reimport_job
 * succeeds, keeping the single reading_progress row for (user, story)
 * pointed at a valid paragraph in whatever revision is now current. Not
 * transactional with the commit itself (the RPC's own hash-in-JS-only
 * stance already accepts that trade-off for the same reason — see
 * migration 0008's header comment) — a failure here just leaves progress
 * pointing at the old (still valid, never-deleted) revision until the
 * reader naturally re-observes a fresh anchor.
 */
export async function remapReadingProgressAfterReimport(
  supabase: SupabaseClient<Database>,
  storyId: string,
  chapterIdPairsRaw: unknown,
): Promise<void> {
  try {
    const pairs = parseChapterIdPairs(chapterIdPairsRaw);
    if (pairs.length === 0) return;

    const { data: progress } = await supabase
      .from("reading_progress")
      .select(
        "chapter_id, chapter_revision_id, paragraph_anchor_id, paragraph_fingerprint, paragraph_ordinal, paragraph_offset_ratio, chapter_progress_pct",
      )
      .eq("story_id", storyId)
      .maybeSingle();
    if (!progress) return;

    const target = resolveRemapTarget(pairs, progress.chapter_id);
    if (!target || !target.targetRevisionId || target.targetRevisionId === progress.chapter_revision_id) return;

    const [oldContent, newContent] = await Promise.all([
      target.oldRevisionId ? getChapterRevisionContent(supabase, target.oldRevisionId) : null,
      getChapterRevisionContent(supabase, target.targetRevisionId),
    ]);
    if (!newContent) return;

    const resolved = resolveResumeAnchor(
      progress.paragraph_anchor_id,
      progress.paragraph_fingerprint,
      progress.paragraph_ordinal,
      oldContent?.content.blocks.length ?? 0,
      newContent.content.blocks,
    );
    if (!resolved) return;

    if (resolved.method !== "exact") {
      logEvent("reimport.progress_remap_fallback", { storyId, method: resolved.method });
    }

    const { error } = await supabase.rpc("upsert_reading_progress", {
      p_story_id: storyId,
      p_chapter_id: target.targetChapterId,
      p_chapter_revision_id: target.targetRevisionId,
      p_paragraph_anchor_id: resolved.anchorId,
      p_paragraph_fingerprint: resolved.fingerprint,
      p_paragraph_ordinal: resolved.ordinal,
      p_paragraph_offset_ratio: null,
      p_chapter_progress_pct: resolved.progressPct,
      p_write_id: crypto.randomUUID(),
      p_observed_at: new Date().toISOString(),
    });
    if (error) {
      logEvent("reimport.progress_remap_error", { code: error.code });
      return;
    }
    logEvent("reimport.progress_remapped", { storyId, method: resolved.method });
  } catch {
    logEvent("reimport.progress_remap_error", { code: "exception" });
  }
}
