import { ArrowLeft, Network } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LibraryGraphCard } from "@/components/graph/library-graph-card";
import { Button } from "@/components/ui/button";
import { getLibraryGraphOverview } from "@/lib/graph/queries";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export default function LibraryGraphsPage() {
  if (!isSupabaseConfigured) {
    return (
      <p className="max-w-sm p-6 text-sm text-[var(--kd-text-muted)]">
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <LibraryGraphsContent />
    </Suspense>
  );
}

async function LibraryGraphsContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/auth/login?next=/library/graphs");

  const result = await getLibraryGraphOverview(supabase, userId);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/library">
          <ArrowLeft size={16} /> Quay lại thư viện
        </Link>
      </Button>
      <div className="mt-4 flex items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "var(--kd-binding)",
            color: "var(--kd-accent-foreground)",
          }}
        >
          <Network size={22} />
        </span>
        <div>
          <p className="text-sm font-bold text-[var(--kd-gilt)]">
            Tổng quan quan hệ
          </p>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
            Graph View thư viện
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--kd-text-muted)]">
            Mỗi card là một cụm tác phẩm liên thông. Preview SVG tĩnh, không chạy
            physics simulation nền.
          </p>
        </div>
      </div>

      {result.error ? (
        <div
          role="alert"
          className="mt-6 rounded-2xl border p-5 text-sm"
          style={{ borderColor: "var(--kd-border)" }}
        >
          Không tải được tổng quan graph. Hãy{" "}
          <Link href="/library/graphs" className="underline">
            thử lại
          </Link>
          .
        </div>
      ) : !result.data || result.data.length === 0 ? (
        <div
          className="mt-6 rounded-3xl border p-8 text-center"
          style={{
            background: "var(--kd-surface)",
            borderColor: "var(--kd-border)",
          }}
        >
          <Network className="mx-auto opacity-35" />
          <p className="mt-3 text-sm text-[var(--kd-text-muted)]">
            Chưa có tác phẩm đang hoạt động để hiển thị.
          </p>
        </div>
      ) : (
        <ul className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {result.data.map((component) => (
            <li key={component.id}>
              <LibraryGraphCard component={component} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse p-6" aria-busy="true">
      <div className="h-10 w-72 rounded bg-[var(--kd-border)]" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-96 rounded-3xl bg-[var(--kd-surface)]" />
        ))}
      </div>
    </div>
  );
}
