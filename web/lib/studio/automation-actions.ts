"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { analyzeCommittedVersion } from "@/lib/studio/analysis-runner";
import {
  type ContinuityFactStatus,
  type ContinuityKnowledgeState,
  type ContinuityReviewStatus,
  type StudioActionState,
} from "@/lib/studio/types";
import { isUuid } from "@/lib/studio/validation";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";

const REVIEW_DECISIONS = new Set<ContinuityReviewStatus>([
  "accepted",
  "dismissed",
  "intentional",
  "retcon",
]);
const RECORD_STATUSES = new Set<ContinuityFactStatus>([
  "canon",
  "inference",
  "disputed",
]);
const KNOWLEDGE_STATES = new Set<ContinuityKnowledgeState>([
  "knows",
  "does_not_know",
  "believes_false",
  "doubts",
]);

function errorState(message: string): StudioActionState {
  return { status: "error", message };
}

function successState(message: string): StudioActionState {
  return { status: "success", message };
}

async function getOwnedStory(storyId: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub as string | undefined;
  if (!ownerId) redirect(`/auth/login?next=${encodeURIComponent(`/studio/${storyId}`)}`);
  const { data: story, error } = await supabase
    .from("stories")
    .select("id")
    .eq("id", storyId)
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .maybeSingle();
  return error || !story ? null : { supabase, ownerId };
}

function revalidateStudio(storyId: string) {
  revalidatePath("/studio");
  revalidatePath(`/studio/${storyId}`);
}

export async function reviewContinuityInboxItem(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const storyId = formData.get("storyId");
  const itemId = formData.get("itemId");
  const decision = formData.get("decision");
  const recordStatus = formData.get("recordStatus");
  const knowledgeState = formData.get("knowledgeState");
  if (!isUuid(storyId) || !isUuid(itemId)) {
    return errorState("Tác phẩm hoặc mục Continuity Inbox không hợp lệ.");
  }
  if (typeof decision !== "string" || !REVIEW_DECISIONS.has(decision as ContinuityReviewStatus)) {
    return errorState("Quyết định duyệt không hợp lệ.");
  }

  const normalizedRecordStatus =
    typeof recordStatus === "string" && RECORD_STATUSES.has(recordStatus as ContinuityFactStatus)
      ? (recordStatus as ContinuityFactStatus)
      : null;
  const normalizedKnowledgeState =
    typeof knowledgeState === "string" && KNOWLEDGE_STATES.has(knowledgeState as ContinuityKnowledgeState)
      ? (knowledgeState as ContinuityKnowledgeState)
      : null;

  const owned = await getOwnedStory(storyId);
  if (!owned) return errorState("Không tìm thấy tác phẩm để duyệt continuity.");
  const { data: item, error: itemError } = await owned.supabase
    .from("continuity_inbox_items")
    .select("id, kind, alert_kind")
    .eq("id", itemId)
    .eq("story_id", storyId)
    .eq("owner_id", owned.ownerId)
    .maybeSingle();
  if (itemError || !item) return errorState("Mục Inbox không còn khả dụng.");

  if (decision === "accepted" && item.kind !== "alert" && !normalizedRecordStatus) {
    return errorState("Hãy chọn mức chắc chắn trước khi chấp nhận ứng viên.");
  }
  if (decision === "accepted" && item.kind === "knowledge_claim" && !normalizedKnowledgeState) {
    return errorState("Hãy chọn trạng thái kiến thức của nhân vật.");
  }
  if ((decision === "intentional" || decision === "retcon") && item.kind !== "alert") {
    return errorState("Quyết định này chỉ áp dụng cho cảnh báo continuity.");
  }
  if (decision === "retcon" && item.alert_kind !== "state_conflict") {
    return errorState("Chỉ cảnh báo trạng thái xung đột mới có thể đánh dấu retcon.");
  }

  const { error } = await owned.supabase.rpc("review_continuity_inbox_item", {
    p_item_id: itemId,
    p_decision: decision as ContinuityReviewStatus,
    p_record_status: normalizedRecordStatus,
    p_knowledge_state: normalizedKnowledgeState,
  });
  if (error) {
    logEvent("studio.inbox_review_error", { code: error.code, storyId, kind: item.kind });
    return errorState("Không thể lưu quyết định duyệt. Vui lòng tải lại và thử lần nữa.");
  }

  logEvent("studio.inbox_reviewed", { storyId, kind: item.kind, decision });
  revalidateStudio(storyId);
  return successState("Đã lưu quyết định và cập nhật bộ nhớ tác phẩm.");
}

export async function runLatestContinuityAnalysis(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const storyId = formData.get("storyId");
  if (!isUuid(storyId)) return errorState("Tác phẩm không hợp lệ.");
  const owned = await getOwnedStory(storyId);
  if (!owned) return errorState("Không tìm thấy tác phẩm để phân tích.");

  const { data: version, error } = await owned.supabase
    .from("story_versions")
    .select("id, import_job_id")
    .eq("story_id", storyId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !version) return errorState("Tác phẩm chưa có phiên bản đã import để phân tích.");

  const result = await analyzeCommittedVersion(
    owned.supabase,
    owned.ownerId,
    storyId,
    version.id,
    version.import_job_id,
  );
  revalidateStudio(storyId);
  if (result.status === "completed") {
    return successState(`Đã tạo ${result.candidates} ứng viên và ${result.alerts} cảnh báo để duyệt.`);
  }
  if (result.status === "skipped") {
    return successState("Phiên bản mới nhất đã được phân tích trước đó.");
  }
  if (result.status === "unavailable") {
    return errorState("Database chưa có migration Continuity Studio P1.");
  }
  return errorState("Phân tích chưa hoàn tất. Bạn có thể thử lại mà không ảnh hưởng bản thảo.");
}
