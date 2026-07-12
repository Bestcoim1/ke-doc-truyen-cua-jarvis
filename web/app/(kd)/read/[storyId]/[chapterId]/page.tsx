import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

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
import { ReaderView } from "@/components/reader/reader-view";

type ReaderChapterPageProps = {
  params: Promise<{ storyId: string; chapterId: string }>;
};

export default function ReaderChapterPage({
  params,
}: ReaderChapterPageProps) {
  if (!isSupabaseConfigured) {
    return (
      <p className="max-w-sm p-6 text-sm" style={{ color: "var(--kd-text-muted)" }}>
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={null}>
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

  const { sections, chapters } = await getSectionsAndChapters(supabase, storyId);
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

  return (
    <ReaderView
      storyId={storyId}
      storyTitle={story.title}
      chapter={{
        chapterId: entry.chapterId,
        chapterTitle: entry.chapterTitle,
        sectionTitle: entry.sectionTitle,
        revisionId: content.revisionId,
        contentHash: content.contentHash,
        blocks: content.content.blocks,
      }}
      prevChapterId={index > 0 ? flat[index - 1].chapterId : null}
      nextChapterEntry={index < flat.length - 1 ? flat[index + 1] : null}
      resumeAnchorId={
        progress?.chapter_id === chapterId ? progress.paragraph_anchor_id : null
      }
      chapterReadState={readStates.get(chapterId) ?? null}
      initialSettings={settings}
      tocSections={sections}
      tocChapters={chapters}
      tocReadStates={Object.fromEntries(readStates)}
    />
  );
}
