import { ArrowLeft, BookOpen, ChevronRight, PenTool } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { getStudioStories } from "@/lib/studio/queries";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { getWritingStatusMeta } from "@/lib/writing-status";

export default function StudioPage() {
  if (!isSupabaseConfigured) {
    return (
      <p className="max-w-lg p-6 text-sm text-[var(--studio-muted)]">
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }
  return (
    <Suspense fallback={<StudioIndexSkeleton />}>
      <StudioIndexContent />
    </Suspense>
  );
}

async function StudioIndexContent() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub as string | undefined;
  if (!ownerId) redirect("/auth/login?next=/studio");

  const result = await getStudioStories(supabase, ownerId);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-7 sm:py-10">
      <Button asChild variant="ghost" className="-ml-3 rounded-full text-[var(--studio-muted)]">
        <Link href="/library"><ArrowLeft size={16} /> Quay lại Kệ đọc</Link>
      </Button>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-extrabold text-[var(--studio-accent)]">Không gian sáng tác riêng</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">Phòng Sáng Tác</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--studio-muted)]">
            Mở bộ nhớ continuity của từng tác phẩm trước khi viết. Mọi canon đều do bạn xác nhận và luôn giữ liên kết về nguồn.
          </p>
        </div>
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--studio-accent)] text-white shadow-lg shadow-black/10">
          <PenTool size={23} />
        </span>
      </div>

      {result.error ? (
        <div role="alert" className="mt-7 rounded-3xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-6 text-sm">
          Không tải được danh sách tác phẩm. Hãy thử lại sau.
        </div>
      ) : !result.data || result.data.length === 0 ? (
        <div className="mt-7 rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface)] p-9 text-center">
          <BookOpen className="mx-auto text-[var(--studio-muted)]" />
          <p className="mt-4 text-sm text-[var(--studio-muted)]">Chưa có tác phẩm đang hoạt động để mở Studio.</p>
          <Button asChild className="mt-5 rounded-full"><Link href="/import/new">Thêm tác phẩm</Link></Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((story) => {
            const writing = getWritingStatusMeta(story.writingStatus);
            return (
              <li key={story.id}>
                <Link
                  href={`/studio/${story.id}`}
                  className="group flex h-full min-h-64 flex-col rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface)] p-6 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--studio-bg)] text-[var(--studio-accent)]"><BookOpen size={20} /></span>
                    <span className="rounded-full bg-[var(--studio-bg)] px-3 py-1 text-xs font-bold text-[var(--studio-muted)]">{writing.label}</span>
                  </div>
                  <h2 className="mt-6 text-2xl font-extrabold leading-tight">{story.title}</h2>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--studio-muted)]">
                    {story.description || "Story Bible, fact có nguồn, plot thread và bản nhắc trước khi viết."}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-extrabold text-[var(--studio-accent)]">
                    Mở bộ nhớ tác phẩm <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StudioIndexSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse p-7" aria-busy="true">
      <div className="h-12 w-72 rounded-2xl bg-[var(--studio-surface)]" />
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-64 rounded-[2rem] bg-[var(--studio-surface)]" />)}
      </div>
    </div>
  );
}
