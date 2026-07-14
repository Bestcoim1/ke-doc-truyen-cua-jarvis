import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CancelJobButton } from "@/components/import/cancel-job-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isCancellableStatus, listImportJobs } from "@/lib/import/queries";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

const STATUS_LABELS = {
  uploaded: "Đã tải lên",
  parsing: "Đang tách chương",
  needs_review: "Chờ review",
  committing: "Đang commit",
  completed: "Hoàn tất",
  failed: "Lỗi",
  cancelled: "Đã hủy",
} as const;

const SOURCE_LABELS = {
  paste: "Paste text",
  txt: "TXT",
  docx: "DOCX",
} as const;

export default function ImportDraftsPage() {
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
      <ImportDraftsContent />
    </Suspense>
  );
}

async function ImportDraftsContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/auth/login?next=/import");

  const jobs = await listImportJobs(supabase, userId);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm" style={{ color: "var(--kd-text-muted)" }}>
            Import
          </p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
            Bản nháp đang chờ
          </h1>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/import/new">Thêm tác phẩm</Link>
        </Button>
      </div>

      {jobs.length === 0 ? (
        <p className="mt-6 text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Chưa có bản nháp nào. Bắt đầu bằng cách paste nội dung truyện.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              style={{
                background: "var(--kd-surface)",
                borderColor: "var(--kd-border)",
              }}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {SOURCE_LABELS[job.source_type]}
                  </Badge>
                  <Badge
                    variant={
                      job.status === "failed" ? "destructive" : "secondary"
                    }
                  >
                    {STATUS_LABELS[job.status]}
                  </Badge>
                </div>
                <p
                  className="mt-1 truncate text-sm"
                  style={{ color: "var(--kd-text-muted)" }}
                >
                  {job.source_filename ?? "Không có tên file"} ·{" "}
                  {new Date(job.created_at).toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {job.status === "needs_review" ? (
                  <Button asChild size="sm">
                    <Link href={`/import/review/${job.id}`}>
                      Tiếp tục review
                    </Link>
                  </Button>
                ) : null}
                {job.status === "completed" && job.story_id ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/read/${job.story_id}`}>
                      Mở trong Thư viện
                    </Link>
                  </Button>
                ) : null}
                {isCancellableStatus(job.status) ? (
                  <CancelJobButton jobId={job.id} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
