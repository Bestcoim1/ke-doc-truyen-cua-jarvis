import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { DeleteStoryButton } from "@/components/library/delete-story-button";
import { LibrarySkeleton } from "@/components/library/library-skeleton";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { logEvent } from "@/lib/telemetry";

export default function LibraryPage() {
  if (!isSupabaseConfigured) {
    return (
      <p className="max-w-sm p-6 text-sm" style={{ color: "var(--kd-text-muted)" }}>
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryContent />
    </Suspense>
  );
}

async function LibraryContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    redirect("/auth/login?next=/library");
  }

  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, title, last_read_at, updated_at")
    .eq("owner_id", user.sub)
    .eq("status", "active")
    .order("last_read_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (storiesError) {
    logEvent("library.stories_query_error", { code: storiesError.code });
  } else {
    logEvent("library.viewed", { storyCount: stories?.length ?? 0 });
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
          Chưa có tác phẩm nào. Hãy thêm truyện đầu tiên bằng paste text.
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
              <Link href={`/read/${story.id}`} className="min-w-0 flex-1">
                <div className="truncate font-semibold">{story.title}</div>
                <div className="mt-1 text-sm" style={{ color: "var(--kd-text-muted)" }}>
                  {story.last_read_at ? "Đọc tiếp" : "Bắt đầu đọc"}
                </div>
              </Link>
              <Link
                href={`/import/reimport/${story.id}/new`}
                className="shrink-0 text-xs underline"
                style={{ color: "var(--kd-text-muted)" }}
              >
                Cập nhật bản thảo
              </Link>
              <DeleteStoryButton storyId={story.id} storyTitle={story.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
