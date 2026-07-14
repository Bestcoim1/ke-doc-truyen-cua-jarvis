import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ImportReimportMethodPicker } from "@/components/import/import-reimport-method-picker";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

type ReimportNewPageProps = {
  params: Promise<{ storyId: string }>;
};

export default function ReimportNewPage({ params }: ReimportNewPageProps) {
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
    <Suspense fallback={null}>
      <ReimportNewContent params={params} />
    </Suspense>
  );
}

async function ReimportNewContent({ params }: ReimportNewPageProps) {
  const { storyId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;

  if (!userId) {
    redirect(`/auth/login?next=/import/reimport/${storyId}/new`);
  }

  const { data: story } = await supabase
    .from("stories")
    .select("id, title, status")
    .eq("id", storyId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!story || story.status !== "active") notFound();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Cập nhật bản thảo
        </p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
          {story.title}
        </h1>
        <p
          className="mt-2 text-sm leading-6"
          style={{ color: "var(--kd-text-muted)" }}
        >
          Thư viện chưa thay đổi cho tới khi bạn xem xong bản so sánh và bấm
          commit.
        </p>
      </div>
      <div
        className="rounded-xl border p-4 sm:p-6"
        style={{
          background: "var(--kd-surface)",
          borderColor: "var(--kd-border)",
        }}
      >
        <ImportReimportMethodPicker
          storyId={story.id}
          storyTitle={story.title}
        />
      </div>
    </div>
  );
}
