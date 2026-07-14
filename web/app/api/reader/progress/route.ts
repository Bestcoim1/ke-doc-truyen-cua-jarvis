import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";

/**
 * Progress writes come through this route handler instead of a Server
 * Action because every flush trigger that matters (chapter navigation,
 * pagehide, tab hide) happens right before the document goes away.
 * `fetch(..., { keepalive: true })` lets the browser finish the request
 * after navigation starts; Server Action POSTs get aborted in exactly
 * those moments, which silently violated FR-10/AC-PROG-03.
 *
 * write_id and observed_at are generated on the CLIENT at the moment the
 * anchor was observed (not here): a late retry must keep its original
 * observed_at so the RPC's ordering guard can reject it against a newer
 * write from another device.
 */

type ProgressPayload = {
  storyId: string;
  chapterId: string;
  chapterRevisionId: string;
  paragraphAnchorId: string;
  paragraphFingerprint: string;
  paragraphOrdinal: number;
  paragraphOffsetRatio: number | null;
  chapterProgressPct: number;
  writeId: string;
  observedAt: string;
};

type ChapterStatePayload = {
  storyId: string;
  chapterId: string;
  revisionId: string;
  contentHash: string;
  anchorId: string;
  progressPct: number;
  markCompleted: boolean;
  completionMethod: "reader_end" | "next_action" | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseProgress(raw: unknown): ProgressPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    !isUuid(p.storyId) ||
    !isUuid(p.chapterId) ||
    !isUuid(p.chapterRevisionId) ||
    !isUuid(p.writeId) ||
    typeof p.paragraphAnchorId !== "string" ||
    p.paragraphAnchorId.length === 0 ||
    p.paragraphAnchorId.length > 100 ||
    typeof p.paragraphFingerprint !== "string" ||
    p.paragraphFingerprint.length > 100 ||
    !isFiniteNumber(p.paragraphOrdinal) ||
    !isFiniteNumber(p.chapterProgressPct) ||
    typeof p.observedAt !== "string" ||
    Number.isNaN(Date.parse(p.observedAt))
  ) {
    return null;
  }
  const offset = p.paragraphOffsetRatio;
  return {
    storyId: p.storyId,
    chapterId: p.chapterId,
    chapterRevisionId: p.chapterRevisionId,
    paragraphAnchorId: p.paragraphAnchorId,
    paragraphFingerprint: p.paragraphFingerprint,
    paragraphOrdinal: Math.max(0, Math.trunc(p.paragraphOrdinal)),
    paragraphOffsetRatio: isFiniteNumber(offset)
      ? Math.min(1, Math.max(0, offset))
      : null,
    chapterProgressPct: Math.min(100, Math.max(0, p.chapterProgressPct)),
    writeId: p.writeId,
    observedAt: p.observedAt,
  };
}

function parseChapterState(raw: unknown): ChapterStatePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    !isUuid(p.storyId) ||
    !isUuid(p.chapterId) ||
    !isUuid(p.revisionId) ||
    typeof p.contentHash !== "string" ||
    p.contentHash.length === 0 ||
    p.contentHash.length > 128 ||
    typeof p.anchorId !== "string" ||
    p.anchorId.length > 100 ||
    !isFiniteNumber(p.progressPct)
  ) {
    return null;
  }
  const method = p.completionMethod;
  return {
    storyId: p.storyId,
    chapterId: p.chapterId,
    revisionId: p.revisionId,
    contentHash: p.contentHash,
    anchorId: p.anchorId,
    progressPct: Math.min(100, Math.max(0, p.progressPct)),
    markCompleted: p.markCompleted === true,
    completionMethod:
      method === "reader_end" || method === "next_action" ? method : null,
  };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { progress: rawProgress, chapterState: rawChapterState } =
    (body as { progress?: unknown; chapterState?: unknown }) ?? {};

  const progress =
    rawProgress !== undefined ? parseProgress(rawProgress) : null;
  const chapterState =
    rawChapterState !== undefined ? parseChapterState(rawChapterState) : null;

  if (rawProgress !== undefined && !progress) {
    return NextResponse.json({ error: "invalid_progress" }, { status: 400 });
  }
  if (rawChapterState !== undefined && !chapterState) {
    return NextResponse.json(
      { error: "invalid_chapter_state" },
      { status: 400 },
    );
  }
  if (!progress && !chapterState) {
    return NextResponse.json({ error: "empty_payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // RPCs are security-invoker: RLS + auth.uid() enforce ownership.
  if (progress) {
    const { error } = await supabase.rpc("upsert_reading_progress", {
      p_story_id: progress.storyId,
      p_chapter_id: progress.chapterId,
      p_chapter_revision_id: progress.chapterRevisionId,
      p_paragraph_anchor_id: progress.paragraphAnchorId,
      p_paragraph_fingerprint: progress.paragraphFingerprint,
      p_paragraph_ordinal: progress.paragraphOrdinal,
      p_paragraph_offset_ratio: progress.paragraphOffsetRatio,
      p_chapter_progress_pct: progress.chapterProgressPct,
      p_write_id: progress.writeId,
      p_observed_at: progress.observedAt,
    });
    if (error) {
      logEvent("reader.progress_save_error", { code: error.code });
      return NextResponse.json(
        { error: "progress_write_failed" },
        { status: 500 },
      );
    }
  }

  if (chapterState) {
    const { error } = await supabase.rpc("upsert_chapter_progress", {
      p_story_id: chapterState.storyId,
      p_chapter_id: chapterState.chapterId,
      p_revision_id: chapterState.revisionId,
      p_content_hash: chapterState.contentHash,
      p_anchor_id: chapterState.anchorId,
      p_progress_pct: chapterState.progressPct,
      p_mark_completed: chapterState.markCompleted,
      p_completion_method: chapterState.completionMethod,
    });
    if (error) {
      logEvent("reader.chapter_progress_error", { code: error.code });
      return NextResponse.json(
        { error: "chapter_state_write_failed" },
        { status: 500 },
      );
    }
    if (chapterState.markCompleted) {
      logEvent("reader.chapter_completed", {
        method: chapterState.completionMethod ?? undefined,
      });
    }
  }

  return new NextResponse(null, { status: 204 });
}
