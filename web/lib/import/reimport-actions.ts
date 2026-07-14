"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logEvent } from "@/lib/telemetry";
import type { Json } from "@/database.types";
import {
  assertUnderJobQuota,
  countEmptyChapters,
  deleteStorageObjectSafely,
  DOCX_PARSER_VERSION,
  formString,
  requireUser,
  STORAGE_BUCKET,
  TXT_PARSER_VERSION,
  UUID_RE,
} from "./action-helpers";
import { applyReviewSubmission } from "./draft-validation";
import { parseDocxDraft } from "./docx-parser";
import {
  decodeStrictUtf8Text,
  detectUploadKind,
  MAX_UPLOAD_BYTES,
} from "./file-validation";
import { remapReadingProgressAfterReimport } from "./reimport-progress";
import { parseStoryText, type ImportDraft } from "./text-parser";

const PARSER_VERSION = "text-paste-v1";
const MAX_PASTE_CHARACTERS = 5_000_000;

type ActionState = {
  error: string | null;
  message: string | null;
};

const EMPTY_STATE: ActionState = { error: null, message: null };

/**
 * The mapping_json contract commit_reimport_job expects (migration 0008,
 * decision kinds extended with "unrelated" in 0009) — only shape-validated
 * here (array/string presence). Semantic correctness (injectivity, coverage
 * of every active old chapter, recognized decision kind) is re-derived and
 * re-checked independently by the RPC itself; duplicating that logic here
 * would just be a second place it could drift out of sync.
 */
function validateMappingShape(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Dữ liệu ánh xạ chương không hợp lệ.");
  }
  const mapping = raw as Record<string, unknown>;
  if (
    !Array.isArray(mapping.decisions) ||
    !Array.isArray(mapping.sections) ||
    typeof mapping.baseTreeToken !== "string"
  ) {
    throw new Error("Dữ liệu ánh xạ chương không hợp lệ.");
  }
  return mapping;
}

function reimportCommitErrorMessage(code: string | undefined): string {
  switch (code) {
    case "KD001":
      return "Tác phẩm đã thay đổi ở nơi khác trong lúc bạn review. Hãy tải lại trang để cập nhật.";
    case "KD002":
      return "Có chương bị ánh xạ vào nhiều hơn một chương khác — hãy kiểm tra lại các lựa chọn ánh xạ.";
    case "KD003":
      return "Còn chương cũ chưa được xác nhận (archive hoặc ánh xạ). Hãy xử lý hết trước khi commit.";
    case "KD004":
      return "Một ánh xạ tham chiếu tới chương không còn tồn tại. Hãy tải lại trang.";
    case "KD005":
      return "Dữ liệu ánh xạ chương không hợp lệ (loại quyết định không xác định). Hãy tải lại trang và thử lại.";
    default:
      return "Không thể hoàn tất cập nhật. Bản nháp vẫn được giữ để thử lại.";
  }
}

export async function createPasteReimportJob(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const storyId = formString(formData, "storyId");
  const content = formString(formData, "content");
  if (!UUID_RE.test(storyId)) {
    return { error: "Tác phẩm không hợp lệ.", message: null };
  }
  if (!content.trim()) {
    return {
      error: "Hãy paste nội dung bản thảo mới trước khi tách chương.",
      message: null,
    };
  }
  if (content.length > MAX_PASTE_CHARACTERS) {
    return {
      error: "Nội dung vượt quá giới hạn 5 triệu ký tự.",
      message: null,
    };
  }

  const { supabase, userId } = await requireUser(
    `/import/reimport/${storyId}/new`,
  );

  const { data: story } = await supabase
    .from("stories")
    .select("id, title, status")
    .eq("id", storyId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!story || story.status !== "active") {
    return { error: "Không tìm thấy tác phẩm này để cập nhật.", message: null };
  }

  const quotaError = await assertUnderJobQuota(supabase, userId);
  if (quotaError) return { error: quotaError, message: null };

  let draft;
  try {
    draft = parseStoryText(content, {
      title: story.title,
      sourceType: "paste",
    });
  } catch {
    return {
      error: "Không thể tự tách nội dung này. Hãy kiểm tra văn bản và thử lại.",
      message: null,
    };
  }

  if (draft.stats.chapterCount === 0) {
    return {
      error: "Không tìm thấy nội dung chương để review.",
      message: null,
    };
  }

  const sourceHash = createHash("sha256").update(content).digest("hex");
  const { data: job, error } = await supabase
    .from("import_jobs")
    .insert({
      owner_id: userId,
      story_id: storyId,
      source_type: "paste",
      source_hash: sourceHash,
      parser_version: PARSER_VERSION,
      status: "needs_review",
      draft_json: draft,
      warnings: draft.warnings,
    })
    .select("id")
    .single();

  if (error || !job) {
    logEvent("reimport.job_create_error", {
      code: error?.code ?? "missing_row",
    });
    return {
      error: "Chưa thể tạo bản review. Vui lòng thử lại sau.",
      message: null,
    };
  }

  logEvent("reimport.job_created", {
    storyId,
    chapterCount: draft.stats.chapterCount,
  });
  redirect(`/import/review/${job.id}`);
}

/** File-upload counterpart to createPasteReimportJob — mirrors createFileImport's upload/parse/cleanup lifecycle exactly, just targeting an existing story instead of creating a new one. */
export async function createFileReimportJob(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const storyId = formString(formData, "storyId");
  const file = formData.get("file");
  if (!UUID_RE.test(storyId)) {
    return { error: "Tác phẩm không hợp lệ.", message: null };
  }
  if (!(file instanceof File) || file.size === 0) {
    return {
      error: "Hãy chọn file TXT hoặc DOCX trước khi tải lên.",
      message: null,
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `File vượt quá giới hạn ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`,
      message: null,
    };
  }
  const kind = detectUploadKind(file.name);
  if (!kind) {
    return { error: "Chỉ hỗ trợ file .txt hoặc .docx.", message: null };
  }

  const { supabase, userId } = await requireUser(
    `/import/reimport/${storyId}/new`,
  );

  const { data: story } = await supabase
    .from("stories")
    .select("id, title, status")
    .eq("id", storyId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!story || story.status !== "active") {
    return { error: "Không tìm thấy tác phẩm này để cập nhật.", message: null };
  }

  const quotaError = await assertUnderJobQuota(supabase, userId);
  if (quotaError) return { error: quotaError, message: null };

  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const storagePath = `${userId}/${crypto.randomUUID()}.${kind}`;

  const { data: job, error: insertError } = await supabase
    .from("import_jobs")
    .insert({
      owner_id: userId,
      story_id: storyId,
      source_type: kind,
      source_filename: file.name.slice(0, 255),
      source_hash: sourceHash,
      parser_version:
        kind === "docx" ? DOCX_PARSER_VERSION : TXT_PARSER_VERSION,
      status: "parsing",
    })
    .select("id")
    .single();

  if (insertError || !job) {
    logEvent("reimport.job_create_error", {
      code: insertError?.code ?? "missing_row",
    });
    return {
      error: "Chưa thể tạo bản review. Vui lòng thử lại sau.",
      message: null,
    };
  }

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType:
        kind === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "text/plain",
      upsert: false,
    });

  if (uploadError) {
    logEvent("reimport.upload_error", { code: uploadError.name });
    await supabase
      .from("import_jobs")
      .update({ status: "failed", error_message: "upload_failed" })
      .eq("id", job.id);
    return {
      error: "Không thể tải file lên. Vui lòng thử lại.",
      message: null,
    };
  }

  let draft: ImportDraft;
  try {
    if (kind === "txt") {
      const text = decodeStrictUtf8Text(buffer);
      if (text.length > MAX_PASTE_CHARACTERS) {
        throw new Error("Nội dung vượt quá giới hạn 5 triệu ký tự.");
      }
      draft = parseStoryText(text, { title: story.title, sourceType: "txt" });
    } else {
      draft = await parseDocxDraft(buffer, { title: story.title });
    }
    if (draft.stats.chapterCount === 0) {
      throw new Error("Không tìm thấy nội dung chương để review.");
    }
  } catch (error) {
    await deleteStorageObjectSafely(supabase, storagePath);
    const message =
      error instanceof Error ? error.message : "Không thể xử lý file này.";
    await supabase
      .from("import_jobs")
      .update({ status: "failed", error_message: message })
      .eq("id", job.id);
    return { error: message, message: null };
  }

  const { error: finalizeError } = await supabase
    .from("import_jobs")
    .update({
      status: "needs_review",
      draft_json: draft,
      warnings: draft.warnings,
    })
    .eq("id", job.id);

  if (finalizeError) {
    // Same ordering rationale as createFileImport: draft_json never
    // landed, so the raw upload is the only remaining copy — don't delete
    // it, leave the job in 'parsing' (recoverable) rather than silently
    // and permanently losing the content.
    logEvent("reimport.job_create_error", { code: finalizeError.code });
    return {
      error: "Chưa thể lưu bản review. Vui lòng thử lại sau.",
      message: null,
    };
  }

  await deleteStorageObjectSafely(supabase, storagePath);

  logEvent("reimport.job_created", {
    storyId,
    chapterCount: draft.stats.chapterCount,
    sourceType: kind,
  });
  redirect(`/import/review/${job.id}`);
}

export async function reviewReimportDraft(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const jobId = formString(formData, "jobId");
  const intent = formString(formData, "intent");
  const structureRaw = formString(formData, "structure");
  const contentOpsRaw = formString(formData, "contentOps");
  const mappingRaw = formString(formData, "mapping");
  if (!UUID_RE.test(jobId)) {
    return { error: "Import job không hợp lệ.", message: null };
  }

  const reviewPath = `/import/review/${jobId}`;
  const { supabase, userId } = await requireUser(reviewPath);
  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .select("id, owner_id, story_id, status, draft_json")
    .eq("id", jobId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (jobError || !job || !job.story_id) {
    return { error: "Không tìm thấy bản cập nhật này.", message: null };
  }
  const storyId = job.story_id;

  let draft;
  let mapping: Record<string, unknown>;
  try {
    const structure = JSON.parse(structureRaw) as unknown;
    const contentOps = contentOpsRaw
      ? (JSON.parse(contentOpsRaw) as unknown)
      : [];
    draft = applyReviewSubmission(job.draft_json, structure, contentOps);
    mapping = validateMappingShape(mappingRaw ? JSON.parse(mappingRaw) : null);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Bản review không hợp lệ.",
      message: null,
    };
  }

  if (draft.stats.chapterCount === 0) {
    return {
      error: "Cần giữ lại ít nhất một chương trước khi commit.",
      message: null,
    };
  }

  if (intent === "commit") {
    const emptyChapterCount = countEmptyChapters(draft.sections);
    if (emptyChapterCount > 0) {
      return {
        error: `Còn ${emptyChapterCount} chương rỗng — hãy xóa hoặc gộp trước khi commit.`,
        message: null,
      };
    }
  }

  if (intent === "save") {
    const { data: updated, error } = await supabase
      .from("import_jobs")
      .update({
        draft_json: draft,
        mapping_json: mapping as unknown as Json,
        warnings: draft.warnings,
      })
      .eq("id", jobId)
      .eq("owner_id", userId)
      .eq("status", "needs_review")
      .select("id")
      .maybeSingle();
    if (error || !updated) {
      return {
        error:
          "Chưa thể lưu thay đổi. Bản cập nhật có thể đã được commit ở nơi khác.",
        message: null,
      };
    }
    revalidatePath(reviewPath);
    return { error: null, message: "Đã lưu bản review." };
  }

  if (intent !== "commit") return EMPTY_STATE;

  // Same ordering as reviewImportDraft's commit branch: persist exactly
  // what was just reviewed (draft_json + mapping_json) before calling the
  // RPC, which reads both off the row rather than trusting request params.
  const { data: persisted, error: persistError } = await supabase
    .from("import_jobs")
    .update({
      draft_json: draft,
      mapping_json: mapping as unknown as Json,
      warnings: draft.warnings,
    })
    .eq("id", jobId)
    .eq("owner_id", userId)
    .eq("status", "needs_review")
    .select("id")
    .maybeSingle();

  if (persistError) {
    logEvent("reimport.commit_error", { code: persistError.code });
    return {
      error: "Không thể hoàn tất cập nhật. Bản nháp vẫn được giữ để thử lại.",
      message: null,
    };
  }

  if (!persisted) {
    const { data: current } = await supabase
      .from("import_jobs")
      .select("status")
      .eq("id", jobId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (current?.status !== "completed") {
      return {
        error:
          "Bản cập nhật không còn ở trạng thái có thể commit. Hãy tải lại trang.",
        message: null,
      };
    }
  }

  const { data, error } = await supabase.rpc("commit_reimport_job", {
    p_job_id: jobId,
  });
  const result = Array.isArray(data) ? data[0] : data;
  const resultStoryId = result?.story_id;
  if (error || !resultStoryId) {
    logEvent("reimport.commit_error", {
      code: error?.code ?? "missing_result",
    });
    return { error: reimportCommitErrorMessage(error?.code), message: null };
  }

  await remapReadingProgressAfterReimport(
    supabase,
    resultStoryId,
    result?.chapter_id_pairs ?? null,
  );

  revalidatePath("/library");
  revalidatePath(reviewPath);
  logEvent("reimport.commit_success", {
    storyId,
    chapterCount: draft.stats.chapterCount,
  });
  redirect(`/read/${resultStoryId}`);
}
