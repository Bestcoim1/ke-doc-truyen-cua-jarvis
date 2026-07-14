import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import {
  buildFlatChapterList,
  getReadingProgress,
  getSectionsAndChapters,
  getStoryForReader,
} from "@/lib/reader/queries";
import { ReaderSkeleton } from "@/components/reader/reader-skeleton";

type ReaderResumePageProps = {
  params: Promise<{ storyId: string }>;
};

export default function ReaderResumePage({ params }: ReaderResumePageProps) {
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
      <ReaderResumeContent params={params} />
    </Suspense>
  );
}

async function ReaderResumeContent({ params }: ReaderResumePageProps) {
  const { storyId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;

  if (!userId) {
    redirect(`/auth/login?next=/read/${storyId}`);
  }

  const story = await getStoryForReader(supabase, userId, storyId);
  if (!story) notFound();

  const progress = await getReadingProgress(supabase, userId, storyId);
  if (progress?.chapter_id) {
    redirect(`/read/${storyId}/${progress.chapter_id}`);
  }

  const { sections, chapters } = await getSectionsAndChapters(
    supabase,
    storyId,
  );
  const flat = buildFlatChapterList(sections, chapters);
  if (flat.length === 0) notFound();

  return redirect(`/read/${storyId}/${flat[0].chapterId}`);
}
