"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Database } from "@/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  CONTINUITY_ENTITY_KINDS,
  CONTINUITY_EVIDENCE_KINDS,
  CONTINUITY_FACT_STATUSES,
  CONTINUITY_THREAD_STATUSES,
  CONTINUITY_THREAD_TYPES,
  type ContinuityEntityKind,
  type ContinuityEvidenceKind,
  type ContinuityFactStatus,
  type ContinuityThreadStatus,
  type ContinuityThreadType,
  type StudioActionState,
} from "@/lib/studio/types";
import {
  isUuid,
  normalizeAliases,
  normalizeOptionalText,
  normalizeRequiredText,
  parseLineRange,
} from "@/lib/studio/validation";
import { logEvent } from "@/lib/telemetry";

const ENTITY_KIND_SET = new Set<string>(CONTINUITY_ENTITY_KINDS);
const EVIDENCE_KIND_SET = new Set<string>(CONTINUITY_EVIDENCE_KINDS);
const FACT_STATUS_SET = new Set<string>(CONTINUITY_FACT_STATUSES);
const THREAD_TYPE_SET = new Set<string>(CONTINUITY_THREAD_TYPES);
const THREAD_STATUS_SET = new Set<string>(CONTINUITY_THREAD_STATUSES);

type StudioClient = Awaited<ReturnType<typeof createClient>>;

function errorState(message: string): StudioActionState {
  return { status: "error", message };
}

function successState(message: string): StudioActionState {
  return { status: "success", message };
}

function optionalTextWithLimit(
  formData: FormData,
  name: string,
  maxLength: number,
) {
  const value = formData.get(name);
  if (typeof value !== "string") return { value: null, valid: true };
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return { value: null, valid: false };
  return { value: trimmed || null, valid: true };
}

async function getOwnedStory(storyId: string, nextPath: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub as string | undefined;
  if (!ownerId) redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);

  const { data: story, error } = await supabase
    .from("stories")
    .select("id")
    .eq("id", storyId)
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !story) return null;
  return { supabase, ownerId };
}

type PreparedEvidence = {
  chapterId: string | null;
  chapterRevisionId: string | null;
  sourceKind: ContinuityEvidenceKind;
  sourceLabel: string;
  startLine: number | null;
  endLine: number | null;
  excerpt: string | null;
};

async function prepareEvidence(
  supabase: StudioClient,
  storyId: string,
  formData: FormData,
): Promise<{ data: PreparedEvidence | null; error: string | null }> {
  const sourceKindValue = formData.get("sourceKind");
  if (
    typeof sourceKindValue !== "string" ||
    !EVIDENCE_KIND_SET.has(sourceKindValue)
  ) {
    return { data: null, error: "Loại nguồn không hợp lệ." };
  }

  const chapterValue = formData.get("chapterId");
  const chapterId = chapterValue === "" ? null : chapterValue;
  if (chapterId !== null && !isUuid(chapterId)) {
    return { data: null, error: "Chương dẫn chứng không hợp lệ." };
  }

  const sourceLabelInput = optionalTextWithLimit(formData, "sourceLabel", 500);
  const excerptInput = optionalTextWithLimit(formData, "excerpt", 4000);
  if (!sourceLabelInput.valid || !excerptInput.valid) {
    return { data: null, error: "Nguồn hoặc trích đoạn quá dài." };
  }

  const lineRange = parseLineRange(
    formData.get("startLine"),
    formData.get("endLine"),
  );
  if (!lineRange.ok) {
    return { data: null, error: "Khoảng dòng dẫn chứng không hợp lệ." };
  }

  let sourceLabel = sourceLabelInput.value;
  let chapterRevisionId: string | null = null;
  if (chapterId) {
    const { data: chapter, error } = await supabase
      .from("chapters")
      .select("title, current_revision_id")
      .eq("id", chapterId)
      .eq("story_id", storyId)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !chapter) {
      return { data: null, error: "Không tìm thấy chương dẫn chứng." };
    }
    sourceLabel ??= chapter.title;
    chapterRevisionId = chapter.current_revision_id;
  }

  if (!sourceLabel) {
    return {
      data: null,
      error: "Hãy chọn một chương hoặc ghi rõ tên nguồn dẫn chứng.",
    };
  }

  return {
    data: {
      chapterId,
      chapterRevisionId,
      sourceKind: sourceKindValue as ContinuityEvidenceKind,
      sourceLabel,
      startLine: lineRange.startLine,
      endLine: lineRange.endLine,
      excerpt: excerptInput.value,
    },
    error: null,
  };
}

function revalidateStudio(storyId: string) {
  revalidatePath("/studio");
  revalidatePath(`/studio/${storyId}`);
}

export async function createContinuityEntity(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const storyId = formData.get("storyId");
  const kindValue = formData.get("kind");
  const name = normalizeRequiredText(formData.get("name"), 160);
  const description = normalizeOptionalText(formData.get("description"), 4000);
  if (!isUuid(storyId) || typeof kindValue !== "string" || !ENTITY_KIND_SET.has(kindValue)) {
    return errorState("Tác phẩm hoặc loại mục Story Bible không hợp lệ.");
  }
  if (!name) return errorState("Tên phải có từ 1 đến 160 ký tự.");
  const rawDescription = formData.get("description");
  if (typeof rawDescription === "string" && rawDescription.trim().length > 4000) {
    return errorState("Mô tả không được vượt quá 4.000 ký tự.");
  }

  const owned = await getOwnedStory(storyId, `/studio/${storyId}`);
  if (!owned) return errorState("Không tìm thấy tác phẩm để cập nhật.");

  const { error } = await owned.supabase.from("continuity_entities").insert({
    owner_id: owned.ownerId,
    story_id: storyId,
    kind: kindValue as ContinuityEntityKind,
    name,
    aliases: normalizeAliases(formData.get("aliases")),
    description,
  });
  if (error) {
    logEvent("studio.entity_create_error", { code: error.code, storyId });
    return errorState("Không thể thêm mục Story Bible. Vui lòng thử lại.");
  }

  logEvent("studio.entity_created", { storyId, kind: kindValue });
  revalidateStudio(storyId);
  return successState("Đã thêm vào Story Bible.");
}

export async function createContinuityFact(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const storyId = formData.get("storyId");
  const entityValue = formData.get("entityId");
  const entityId = entityValue === "" ? null : entityValue;
  const statusValue = formData.get("status");
  const statement = normalizeRequiredText(formData.get("statement"), 4000);
  if (!isUuid(storyId) || (entityId !== null && !isUuid(entityId))) {
    return errorState("Tác phẩm hoặc thực thể không hợp lệ.");
  }
  if (typeof statusValue !== "string" || !FACT_STATUS_SET.has(statusValue)) {
    return errorState("Trạng thái fact không hợp lệ.");
  }
  if (!statement) return errorState("Fact phải có từ 1 đến 4.000 ký tự.");

  const owned = await getOwnedStory(storyId, `/studio/${storyId}`);
  if (!owned) return errorState("Không tìm thấy tác phẩm để cập nhật.");
  const prepared = await prepareEvidence(owned.supabase, storyId, formData);
  if (!prepared.data) return errorState(prepared.error ?? "Dẫn chứng không hợp lệ.");

  const { data: fact, error: factError } = await owned.supabase
    .from("continuity_facts")
    .insert({
      owner_id: owned.ownerId,
      story_id: storyId,
      entity_id: entityId,
      statement,
      status: statusValue as ContinuityFactStatus,
    })
    .select("id")
    .single();
  if (factError || !fact) {
    logEvent("studio.fact_create_error", {
      code: factError?.code ?? "no_row",
      storyId,
    });
    return errorState("Không thể lưu fact. Kiểm tra thực thể rồi thử lại.");
  }

  const evidenceInsert: Database["public"]["Tables"]["continuity_evidence"]["Insert"] = {
    owner_id: owned.ownerId,
    story_id: storyId,
    fact_id: fact.id,
    source_kind: prepared.data.sourceKind,
    source_label: prepared.data.sourceLabel,
    chapter_id: prepared.data.chapterId,
    chapter_revision_id: prepared.data.chapterRevisionId,
    start_line: prepared.data.startLine,
    end_line: prepared.data.endLine,
    excerpt: prepared.data.excerpt,
  };
  const { error: evidenceError } = await owned.supabase
    .from("continuity_evidence")
    .insert(evidenceInsert);
  if (evidenceError) {
    const { error: cleanupError } = await owned.supabase
      .from("continuity_facts")
      .delete()
      .eq("id", fact.id)
      .eq("owner_id", owned.ownerId);
    logEvent("studio.fact_evidence_create_error", {
      code: evidenceError.code,
      cleanupCode: cleanupError?.code,
      storyId,
    });
    return errorState("Không thể gắn dẫn chứng nên fact chưa được lưu.");
  }

  logEvent("studio.fact_created", { storyId, status: statusValue });
  revalidateStudio(storyId);
  return successState("Đã lưu fact cùng dẫn chứng.");
}

export async function updateContinuityFactStatus(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const storyId = formData.get("storyId");
  const factId = formData.get("factId");
  const statusValue = formData.get("status");
  if (
    !isUuid(storyId) ||
    !isUuid(factId) ||
    typeof statusValue !== "string" ||
    !FACT_STATUS_SET.has(statusValue)
  ) {
    return errorState("Fact hoặc trạng thái không hợp lệ.");
  }

  const owned = await getOwnedStory(storyId, `/studio/${storyId}`);
  if (!owned) return errorState("Không tìm thấy tác phẩm để cập nhật.");

  if (statusValue === "canon") {
    const { count, error: evidenceError } = await owned.supabase
      .from("continuity_evidence")
      .select("id", { count: "exact", head: true })
      .eq("fact_id", factId)
      .eq("story_id", storyId)
      .eq("owner_id", owned.ownerId);
    if (evidenceError || !count) {
      return errorState("Không thể xác nhận canon khi fact chưa có dẫn chứng.");
    }
  }

  const { data: updated, error } = await owned.supabase
    .from("continuity_facts")
    .update({ status: statusValue as ContinuityFactStatus })
    .eq("id", factId)
    .eq("story_id", storyId)
    .eq("owner_id", owned.ownerId)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    logEvent("studio.fact_status_update_error", {
      code: error?.code ?? "not_found",
      storyId,
    });
    return errorState("Không thể cập nhật trạng thái fact.");
  }

  logEvent("studio.fact_status_updated", { storyId, status: statusValue });
  revalidateStudio(storyId);
  return successState("Đã cập nhật trạng thái fact.");
}

export async function createContinuityPlotThread(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const storyId = formData.get("storyId");
  const typeValue = formData.get("threadType");
  const title = normalizeRequiredText(formData.get("title"), 240);
  const dueChapterValue = formData.get("dueChapterId");
  const dueChapterId = dueChapterValue === "" ? null : dueChapterValue;
  if (!isUuid(storyId) || (dueChapterId !== null && !isUuid(dueChapterId))) {
    return errorState("Tác phẩm hoặc chương dự kiến không hợp lệ.");
  }
  if (typeof typeValue !== "string" || !THREAD_TYPE_SET.has(typeValue)) {
    return errorState("Loại plot thread không hợp lệ.");
  }
  if (!title) return errorState("Tên plot thread phải có từ 1 đến 240 ký tự.");

  const textFields = [
    ["setup", 4000],
    ["promise", 4000],
    ["expectedPayoff", 4000],
    ["notes", 8000],
  ] as const;
  const normalized = new Map<string, string | null>();
  for (const [name, limit] of textFields) {
    const input = optionalTextWithLimit(formData, name, limit);
    if (!input.valid) return errorState("Nội dung plot thread quá dài.");
    normalized.set(name, input.value);
  }

  const owned = await getOwnedStory(storyId, `/studio/${storyId}`);
  if (!owned) return errorState("Không tìm thấy tác phẩm để cập nhật.");
  const prepared = await prepareEvidence(owned.supabase, storyId, formData);
  if (!prepared.data) return errorState(prepared.error ?? "Dẫn chứng không hợp lệ.");

  const { data: thread, error: threadError } = await owned.supabase
    .from("continuity_plot_threads")
    .insert({
      owner_id: owned.ownerId,
      story_id: storyId,
      thread_type: typeValue as ContinuityThreadType,
      title,
      setup: normalized.get("setup"),
      promise: normalized.get("promise"),
      expected_payoff: normalized.get("expectedPayoff"),
      notes: normalized.get("notes"),
      last_touched_chapter_id: prepared.data.chapterId,
      due_chapter_id: dueChapterId,
    })
    .select("id")
    .single();
  if (threadError || !thread) {
    logEvent("studio.thread_create_error", {
      code: threadError?.code ?? "no_row",
      storyId,
    });
    return errorState("Không thể lưu plot thread. Kiểm tra chương rồi thử lại.");
  }

  const { error: evidenceError } = await owned.supabase
    .from("continuity_evidence")
    .insert({
      owner_id: owned.ownerId,
      story_id: storyId,
      plot_thread_id: thread.id,
      source_kind: prepared.data.sourceKind,
      source_label: prepared.data.sourceLabel,
      chapter_id: prepared.data.chapterId,
      chapter_revision_id: prepared.data.chapterRevisionId,
      start_line: prepared.data.startLine,
      end_line: prepared.data.endLine,
      excerpt: prepared.data.excerpt,
    });
  if (evidenceError) {
    const { error: cleanupError } = await owned.supabase
      .from("continuity_plot_threads")
      .delete()
      .eq("id", thread.id)
      .eq("owner_id", owned.ownerId);
    logEvent("studio.thread_evidence_create_error", {
      code: evidenceError.code,
      cleanupCode: cleanupError?.code,
      storyId,
    });
    return errorState("Không thể gắn dẫn chứng nên plot thread chưa được lưu.");
  }

  logEvent("studio.thread_created", { storyId, type: typeValue });
  revalidateStudio(storyId);
  return successState("Đã thêm plot thread cùng dẫn chứng.");
}

export async function updateContinuityThreadStatus(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const storyId = formData.get("storyId");
  const threadId = formData.get("threadId");
  const statusValue = formData.get("status");
  if (
    !isUuid(storyId) ||
    !isUuid(threadId) ||
    typeof statusValue !== "string" ||
    !THREAD_STATUS_SET.has(statusValue)
  ) {
    return errorState("Plot thread hoặc trạng thái không hợp lệ.");
  }

  const owned = await getOwnedStory(storyId, `/studio/${storyId}`);
  if (!owned) return errorState("Không tìm thấy tác phẩm để cập nhật.");

  const { data: updated, error } = await owned.supabase
    .from("continuity_plot_threads")
    .update({ status: statusValue as ContinuityThreadStatus })
    .eq("id", threadId)
    .eq("story_id", storyId)
    .eq("owner_id", owned.ownerId)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    logEvent("studio.thread_status_update_error", {
      code: error?.code ?? "not_found",
      storyId,
    });
    return errorState("Không thể cập nhật trạng thái plot thread.");
  }

  logEvent("studio.thread_status_updated", { storyId, status: statusValue });
  revalidateStudio(storyId);
  return successState("Đã cập nhật plot thread.");
}
