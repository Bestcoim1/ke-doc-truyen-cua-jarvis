import { ArrowLeft, BookOpen, FilePenLine } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ContinuityDashboard } from "@/components/studio/continuity-dashboard";
import { Button } from "@/components/ui/button";
import type { ContinuityBriefSelection } from "@/lib/studio/brief";
import { getContinuityStudio } from "@/lib/studio/queries";
import { isUuid } from "@/lib/studio/validation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

type StudioStoryPageProps = {
  params: Promise<{ storyId: string }>;
  searchParams: Promise<{
    brief?: string;
    pov?: string;
    location?: string;
    characters?: string | string[];
    timeline?: string;
  }>;
};

export default async function StudioStoryPage({ params, searchParams }: StudioStoryPageProps) {
  const { storyId } = await params;
  if (!isUuid(storyId)) notFound();
  if (!isSupabaseConfigured) {
    return <p className="max-w-lg p-6 text-sm text-[var(--studio-muted)]">Supabase chưa được cấu hình.</p>;
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub as string | undefined;
  if (!ownerId) redirect(`/auth/login?next=/studio/${storyId}`);

  const result = await getContinuityStudio(supabase, ownerId, storyId);
  if (!result.data) {
    if (result.error === "missing_schema") {
      return (
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-7">
          <Button asChild variant="ghost" className="-ml-3 rounded-full"><Link href="/studio"><ArrowLeft size={16} /> Quay lại</Link></Button>
          <div role="alert" className="mt-6 rounded-[2rem] border border-amber-400/50 bg-amber-50 p-7 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <h1 className="text-xl font-extrabold">Database chưa có Continuity Studio P0</h1>
            <p className="mt-2 text-sm leading-6">Áp dụng migration mới rồi tải lại trang. Giao diện không tự tạo hoặc tự nâng cấp schema production.</p>
          </div>
        </div>
      );
    }
    notFound();
  }

  const query = await searchParams;
  const characterValues = Array.isArray(query.characters)
    ? query.characters
    : query.characters
      ? [query.characters]
      : [];
  const selection: ContinuityBriefSelection = {
    povEntityId: isUuid(query.pov) ? query.pov : null,
    locationEntityId: isUuid(query.location) ? query.location : null,
    characterEntityIds: characterValues.filter(isUuid),
    timelineNote: typeof query.timeline === "string" ? query.timeline.slice(0, 500) : "",
  };

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 py-7 sm:px-7 sm:py-10">
      <Button asChild variant="ghost" className="-ml-3 rounded-full text-[var(--studio-muted)]">
        <Link href="/studio"><ArrowLeft size={16} /> Tất cả tác phẩm</Link>
      </Button>
      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-extrabold text-[var(--studio-accent)]">Bộ nhớ tác phẩm</p>
          <h1 className="mt-2 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl">{result.data.story.title}</h1>
          <p className="mt-3 text-sm text-[var(--studio-muted)]">
            {result.data.entities.length} mục Story Bible · {result.data.facts.length} fact · {result.data.threads.length} plot thread
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="rounded-full border-[var(--studio-border)] bg-[var(--studio-surface)]">
            <Link href={`/read/${storyId}`}><BookOpen size={16} /> Mở Reader</Link>
          </Button>
          <Button asChild className="rounded-full bg-[var(--studio-accent)] text-white hover:opacity-90">
            <Link href={`/import/reimport/${storyId}/new`}><FilePenLine size={16} /> Cập nhật bản thảo</Link>
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <ContinuityDashboard
          data={result.data}
          selection={selection}
          briefRequested={query.brief === "1"}
        />
      </div>
    </div>
  );
}
