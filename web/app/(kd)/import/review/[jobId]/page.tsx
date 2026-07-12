import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ImportReviewEditor } from "@/components/import/import-review-editor";
import { normalizeImportDraft } from "@/lib/import/draft-validation";
import { toReviewDraft } from "@/lib/import/review-draft";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

type ReviewPageProps = {
  params: Promise<{ jobId: string }>;
};

export default function ReviewImportPage({ params }: ReviewPageProps) {
  if (!isSupabaseConfigured) {
    return (
      <p className="max-w-sm p-6 text-sm" style={{ color: "var(--kd-text-muted)" }}>
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={null}>
      <ReviewImportContent params={params} />
    </Suspense>
  );
}

async function ReviewImportContent({ params }: ReviewPageProps) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect(`/auth/login?next=/import/review/${jobId}`);

  const { data: job, error } = await supabase
    .from("import_jobs")
    .select("id, owner_id, status, story_id, draft_json")
    .eq("id", jobId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error || !job) notFound();

  if (job.status === "completed" && job.story_id) {
    redirect(`/read/${job.story_id}`);
  }

  if (job.status !== "needs_review") {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-bold">Bản import chưa sẵn sàng để review</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Trạng thái hiện tại: {job.status}. Hãy quay lại sau hoặc tạo bản import mới.
        </p>
      </div>
    );
  }

  let draft;
  try {
    draft = toReviewDraft(normalizeImportDraft(job.draft_json));
  } catch {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-bold">Không thể mở bản review</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Dữ liệu parse không hợp lệ. Hãy tạo lại import từ nội dung gốc.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <ImportReviewEditor jobId={jobId} initialDraft={draft} />
    </div>
  );
}
