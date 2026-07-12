import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
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
    <Suspense fallback={null}>
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

  const { data: stories } = await supabase
    .from("stories")
    .select("id, title, last_read_at, updated_at")
    .eq("owner_id", user.sub)
    .eq("status", "active")
    .order("last_read_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  logEvent("library.viewed", { storyCount: stories?.length ?? 0 });

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
      {!stories || stories.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Chưa có tác phẩm nào. Hãy thêm truyện đầu tiên bằng paste text.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {stories.map((story) => (
            <li key={story.id}>
              <Link
                href={`/read/${story.id}`}
                className="block rounded-xl p-4"
                style={{
                  background: "var(--kd-surface)",
                  border: "1px solid var(--kd-border)",
                }}
              >
                <div className="font-semibold">{story.title}</div>
                <div className="mt-1 text-sm" style={{ color: "var(--kd-text-muted)" }}>
                  {story.last_read_at ? "Đọc tiếp" : "Bắt đầu đọc"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
