import { ArrowLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { StoryGraphView } from "@/components/graph/story-graph-view";
import { Button } from "@/components/ui/button";
import { getStoryGraphShell } from "@/lib/graph/queries";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

type StoryGraphPageProps = {
  params: Promise<{ storyId: string }>;
};

export default function StoryGraphPage({ params }: StoryGraphPageProps) {
  if (!isSupabaseConfigured) {
    return (
      <p className="max-w-sm p-6 text-sm text-[var(--kd-text-muted)]">
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={<GraphPageSkeleton />}>
      <StoryGraphContent params={params} />
    </Suspense>
  );
}

async function StoryGraphContent({ params }: StoryGraphPageProps) {
  const { storyId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect(`/auth/login?next=/read/${storyId}/graph`);

  const result = await getStoryGraphShell(supabase, userId, storyId);
  if (!result.data && !result.error) notFound();

  if (!result.data) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center p-6">
        <div
          className="max-w-md rounded-3xl border p-6 text-center"
          style={{
            background: "var(--kd-surface)",
            borderColor: "var(--kd-border)",
          }}
        >
          <h1 className="text-xl font-extrabold">Không tải được Graph View</h1>
          <p className="mt-2 text-sm text-[var(--kd-text-muted)]">
            Có lỗi khi đọc metadata. Nội dung chương không bị ảnh hưởng.
          </p>
          <Button asChild className="mt-4">
            <Link href={`/read/${storyId}/graph`}>Thử lại</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      <header
        className="flex min-h-16 items-center gap-2 border-b px-3 sm:px-5"
        style={{
          background: "var(--kd-surface)",
          borderColor: "var(--kd-border)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <Button asChild variant="ghost" size="icon">
          <Link href={`/read/${storyId}`} aria-label="Quay lại Reader">
            <ArrowLeft size={18} />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-[var(--kd-gilt)]">
            Graph View
          </p>
          <h1 className="truncate text-base font-extrabold sm:text-lg">
            {result.data.story.title}
          </h1>
        </div>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href="/library">
            <BookOpen size={16} />
            <span className="hidden sm:inline">Thư viện</span>
          </Link>
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <StoryGraphView
          key={result.data.relationships
            .map(
              (relationship) =>
                `${relationship.id}:${relationship.sourceStoryId}:${relationship.targetStoryId}:${relationship.relationshipType}`,
            )
            .sort()
            .join("|")}
          initialData={result.data}
        />
      </div>
    </main>
  );
}

function GraphPageSkeleton() {
  return (
    <main className="flex h-[100dvh] flex-col" aria-busy="true">
      <div className="h-16 animate-pulse border-b bg-[var(--kd-surface)]" />
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    </main>
  );
}

function Loader() {
  return <span className="text-sm text-[var(--kd-text-muted)]">Đang tải graph…</span>;
}
