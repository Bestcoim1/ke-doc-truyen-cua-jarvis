import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ImportReimportEditor } from "@/components/import/import-reimport-editor";
import { ImportReviewEditor } from "@/components/import/import-review-editor";
import { normalizeImportDraft } from "@/lib/import/draft-validation";
import type { ManualOverride } from "@/lib/import/reimport-decisions";
import { matchChapters, matchSections } from "@/lib/import/reimport-match";
import { getStoryTreeForReimport } from "@/lib/import/reimport-queries";
import { toReviewDraft } from "@/lib/import/review-draft";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

/**
 * Seeds manual-override state from a previously saved mapping_json, but
 * only if it was computed against the tree as it still stands (same
 * baseTreeToken) — otherwise the story changed underneath the saved
 * mapping and every decision needs re-deriving fresh via matchChapters
 * instead of trusting stale choices.
 */
function manualOverridesFromSavedMapping(
  mappingJson: unknown,
  currentBaseTreeToken: string,
): Record<string, ManualOverride> {
  if (!mappingJson || typeof mappingJson !== "object") return {};
  const mapping = mappingJson as { baseTreeToken?: unknown; decisions?: unknown };
  if (mapping.baseTreeToken !== currentBaseTreeToken || !Array.isArray(mapping.decisions)) return {};

  const overrides: Record<string, ManualOverride> = {};
  for (const raw of mapping.decisions) {
    if (!raw || typeof raw !== "object") continue;
    const decision = raw as { kind?: unknown; oldChapterId?: unknown; newChapterId?: unknown };
    if (typeof decision.oldChapterId !== "string") continue;
    if (decision.kind === "archived") {
      overrides[decision.oldChapterId] = { archived: true };
    } else if (
      (decision.kind === "primary" || decision.kind === "merged") &&
      typeof decision.newChapterId === "string"
    ) {
      overrides[decision.oldChapterId] = { newChapterId: decision.newChapterId };
    }
  }
  return overrides;
}

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
    .select("id, owner_id, status, story_id, draft_json, mapping_json")
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

  let fullDraft;
  try {
    fullDraft = normalizeImportDraft(job.draft_json);
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

  if (job.story_id) {
    const tree = await getStoryTreeForReimport(supabase, job.story_id, userId);
    if (!tree) {
      return (
        <div className="mx-auto max-w-xl p-6">
          <h1 className="text-xl font-bold">Không tìm thấy tác phẩm để cập nhật</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--kd-text-muted)" }}>
            Tác phẩm đích có thể đã bị lưu trữ hoặc không còn thuộc về bạn.
          </p>
        </div>
      );
    }

    const { matches } = matchChapters(tree.oldChapters, fullDraft);
    const { matches: sectionMatches } = matchSections(tree.oldSections, fullDraft);
    const initialManualOverrides = manualOverridesFromSavedMapping(job.mapping_json, tree.baseTreeToken);

    return (
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <ImportReimportEditor
          jobId={jobId}
          initialDraft={toReviewDraft(fullDraft)}
          autoMatches={matches}
          oldChapters={tree.oldChapters}
          sectionMatches={sectionMatches}
          baseTreeToken={tree.baseTreeToken}
          initialManualOverrides={initialManualOverrides}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <ImportReviewEditor jobId={jobId} initialDraft={toReviewDraft(fullDraft)} />
    </div>
  );
}
