import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { ArchiveStoryButton } from "@/components/library/archive-story-button";
import { DeleteStoryButton } from "@/components/library/delete-story-button";
import { LibrarySkeleton } from "@/components/library/library-skeleton";
import { RestoreStoryButton } from "@/components/library/restore-story-button";
import { createClient } from "@/lib/supabase/server";
import { getLibraryStories } from "@/lib/library/queries";
import { isSupabaseConfigured } from "@/lib/utils";
import { logEvent } from "@/lib/telemetry";

type LibraryPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default function LibraryPage({ searchParams }: LibraryPageProps) {
  if (!isSupabaseConfigured) {
    return (
      <p className="max-w-sm p-6 text-sm" style={{ color: "var(--kd-text-muted)" }}>
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LibraryContent({ searchParams }: LibraryPageProps) {
  const { status: statusParam } = await searchParams;
  const status: "active" | "archived" = statusParam === "archived" ? "archived" : "active";

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    redirect("/auth/login?next=/library");
  }

  const { stories, error: storiesError } = await getLibraryStories(supabase, user.sub, status);

  if (!storiesError) {
    logEvent("library.viewed", { storyCount: stories?.length ?? 0, status });
  }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold">Thư viện</h1>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/import">Bản nháp đang chờ</Link>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/import/new">Thêm tác phẩm</Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex w-fit gap-1 rounded-lg border p-1" style={{ borderColor: "var(--kd-border)" }}>
        <Button asChild size="sm" variant={status === "active" ? "default" : "ghost"}>
          <Link href="/library">Đang đọc</Link>
        </Button>
        <Button asChild size="sm" variant={status === "archived" ? "default" : "ghost"}>
          <Link href="/library?status=archived">Đã lưu trữ</Link>
        </Button>
      </div>

      {storiesError ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          Không tải được thư viện. Hãy{" "}
          <Link href="/library" className="underline">
            thử lại
          </Link>
          .
        </p>
      ) : !stories || stories.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--kd-text-muted)" }}>
          {status === "archived"
            ? "Chưa lưu trữ tác phẩm nào."
            : "Chưa có tác phẩm nào. Hãy thêm truyện đầu tiên bằng paste text."}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {stories.map((story) => (
            <li
              key={story.id}
              className="flex items-center gap-3 rounded-xl p-4"
              style={{
                background: "var(--kd-surface)",
                border: "1px solid var(--kd-border)",
              }}
            >
              {status === "active" ? (
                <Link href={`/read/${story.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{story.title}</div>
                  <div className="mt-1 text-sm" style={{ color: "var(--kd-text-muted)" }}>
                    {story.chapterCount} chương
                    {story.progress
                      ? ` · Đang đọc chương ${story.progress.currentOrdinal}/${story.progress.totalChapters} (${story.progress.pct}%)`
                      : story.lastReadAt
                        ? " · Đã đọc"
                        : " · Chưa đọc"}
                  </div>
                </Link>
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{story.title}</div>
                  <div className="mt-1 text-sm" style={{ color: "var(--kd-text-muted)" }}>
                    {story.chapterCount} chương · Đã lưu trữ
                  </div>
                </div>
              )}
              {status === "active" ? (
                <>
                  <Link
                    href={`/import/reimport/${story.id}/new`}
                    className="shrink-0 text-xs underline"
                    style={{ color: "var(--kd-text-muted)" }}
                  >
                    Cập nhật bản thảo
                  </Link>
                  <ArchiveStoryButton storyId={story.id} />
                </>
              ) : (
                <RestoreStoryButton storyId={story.id} />
              )}
              <DeleteStoryButton storyId={story.id} storyTitle={story.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
