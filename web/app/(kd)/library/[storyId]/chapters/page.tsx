import { notFound, redirect } from "next/navigation";

import { ChapterOrderManager } from "@/components/library/chapter-order-manager";
import { getChapterOrderStory } from "@/lib/library/queries";
import { createClient } from "@/lib/supabase/server";

type ChapterOrderPageProps = {
  params: Promise<{ storyId: string }>;
};

export default async function ChapterOrderPage({ params }: ChapterOrderPageProps) {
  const { storyId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) {
    redirect(`/auth/login?next=${encodeURIComponent(`/library/${storyId}/chapters`)}`);
  }

  const story = await getChapterOrderStory(supabase, storyId, userId);
  if (!story) notFound();

  const managerKey = story.sections
    .flatMap((section) => [section.id, ...section.chapters.map((chapter) => chapter.id)])
    .join(":");

  return <ChapterOrderManager key={managerKey} story={story} />;
}
