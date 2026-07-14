import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { logEvent } from "@/lib/telemetry";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import {
  buildFlatChapterList,
  getChapterReadStates,
  getChapterRevisionContent,
  getReadingProgress,
  getReadingSettings,
  getSectionsAndChapters,
  getStoryForReader,
} from "@/lib/reader/queries";
import {
  resolveResumeAnchor,
  type ResumeFallbackMethod,
} from "@/lib/reader/resume-fallback";
import type { Block } from "@/lib/reader/types";
import { ReaderView } from "@/components/reader/reader-view";
import { ReaderSkeleton } from "@/components/reader/reader-skeleton";
import { ChapterRecoveryNotice } from "@/components/reader/chapter-recovery-notice";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

/**
 * Resolves the reader's resume position for this chapter to something that
 * actually exists in `newBlocks`. Only ever a mismatch when the chapter's
 * current revision changed since the progress row was last observed (the
 * common case — re-import's own remap step, lib/import/reimport-progress.ts
 * — already keeps this in sync proactively; this is the safety net for
 * when that didn't run, failed, or predates it). PRD §10.2/FR-10 fallback
 * chain, shared with the remap step via lib/reader/resume-fallback.ts.
 */
async function resolveResumeState(
  supabase: SupabaseClient<Database>,
  progress: {
    chapter_id: string;
    chapter_revision_id: string;
    paragraph_anchor_id: string;
    paragraph_fingerprint: string;
    paragraph_ordinal: number;
  } | null,
  chapterId: string,
  currentRevisionId: string,
  newBlocks: Block[],
): Promise<{ anchorId: string | null; method: ResumeFallbackMethod | null }> {
  if (!progress || progress.chapter_id !== chapterId)
    return { anchorId: null, method: null };
  if (progress.chapter_revision_id === currentRevisionId) {
    return { anchorId: progress.paragraph_anchor_id, method: "exact" };
  }

  const oldContent = await getChapterRevisionContent(
    supabase,
    progress.chapter_revision_id,
  );
  const resolved = resolveResumeAnchor(
    progress.paragraph_anchor_id,
    progress.paragraph_fingerprint,
    progress.paragraph_ordinal,
    oldContent?.content?.blocks.length ?? 0,
    newBlocks,
  );
  if (!resolved) return { anchorId: null, method: null };
  if (resolved.method !== "exact") {
    logEvent("reader.resume_fallback", { chapterId, method: resolved.method });
  }
  return { anchorId: resolved.anchorId, method: resolved.method };
}

type ReaderChapterPageProps = {
  params: Promise<{ storyId: string; chapterId: string }>;
};

export default function ReaderChapterPage({ params }: ReaderChapterPageProps) {
  if (!isSupabaseConfigured) {
    return (
      <p
        className="max-w-sm p-6 text-sm"
        style={{ color: "var(--kd-text-muted)" }}
      >
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={<ReaderSkeleton />}>
      <ReaderChapterContent params={params} />
    </Suspense>
  );
}

async function ReaderChapterContent({ params }: ReaderChapterPageProps) {
  const { storyId, chapterId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;

  if (!userId) {
    redirect(`/auth/login?next=/read/${storyId}/${chapterId}`);
  }

  const story = await getStoryForReader(supabase, userId, storyId);
  if (!story) notFound();

  const { sections, chapters } = await getSectionsAndChapters(
    supabase,
    storyId,
  );
  const flat = buildFlatChapterList(sections, chapters);
  const index = flat.findIndex((entry) => entry.chapterId === chapterId);
  if (index === -1) notFound();

  const entry = flat[index];
  const chapterRow = chapters.find((c) => c.id === chapterId);
  if (!chapterRow?.current_revision_id) notFound();

  const [content, progress, readStates, settings] = await Promise.all([
    getChapterRevisionContent(supabase, chapterRow.current_revision_id),
    getReadingProgress(supabase, userId, storyId),
    getChapterReadStates(supabase, userId, storyId),
    getReadingSettings(supabase, userId),
  ]);
  if (!content) notFound();

  // Revision row exists but its content_blocks blob failed validation (a
  // legacy/corrupt shape). Degrade to a recovery card instead of crashing
  // the reader on undefined blocks (FR-12 §5).
  if (!content.content) {
    logEvent("reader.chapter_content_invalid", { chapterId });
    return (
      <ChapterRecoveryNotice
        storyId={storyId}
        storyTitle={story.title}
        chapterTitle={entry.chapterTitle}
      />
    );
  }

  const resume = await resolveResumeState(
    supabase,
    progress,
    chapterId,
    chapterRow.current_revision_id,
    content.content.blocks,
  );

  return (
    <ReaderView
      storyId={storyId}
      storyTitle={story.title}
      coverImageUrl={story.coverImageUrl}
      chapter={{
        chapterId: entry.chapterId,
        chapterTitle: entry.chapterTitle,
        sectionPath: entry.sectionPath,
        revisionId: content.revisionId,
        contentHash: content.contentHash,
        blocks: content.content.blocks,
      }}
      prevChapterId={index > 0 ? flat[index - 1].chapterId : null}
      nextChapterEntry={index < flat.length - 1 ? flat[index + 1] : null}
      resumeAnchorId={resume.anchorId}
      resumeFallbackMethod={resume.method}
      chapterReadState={readStates.get(chapterId) ?? null}
      initialSettings={settings}
      tocSections={sections}
      tocChapters={chapters}
      tocReadStates={Object.fromEntries(readStates)}
    />
  );
}
