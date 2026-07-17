"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logEvent } from "@/lib/telemetry";
import {
  assertUnderJobQuota,
  BATCH_PARSER_VERSION,
  countEmptyChapters,
  deleteStorageObjectSafely,
  DOCX_PARSER_VERSION,
  formString,
  requireUser,
  STORAGE_BUCKET,
  TXT_PARSER_VERSION,
  UUID_RE,
} from "./action-helpers";
import { mergeOrderedImportDrafts } from "./batch-parser";
import { applyReviewSubmission } from "./draft-validation";
import { parseDocxDraft } from "./docx-parser";
import {
  decodeStrictUtf8Text,
  detectUploadKind,
  MAX_UPLOAD_BYTES,
} from "./file-validation";
import { CANCELLABLE_STATUSES } from "./queries";
import { parseStoryText, type ImportDraft } from "./text-parser";

const PARSER_VERSION = "text-paste-v1";
const MAX_PASTE_CHARACTERS = 5_000_000;
const MAX_BATCH_FILES = 20;
const MAX_BATCH_UPLOAD_BYTES = MAX_UPLOAD_BYTES;

type ActionState = {
  error: string | null;
  message: string | null;
};

const EMPTY_STATE: ActionState = { error: null, message: null };

export async function createPasteImport(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = formString(formData, "title").trim();
  const description = formString(formData, "description").trim();
  const content = formString(formData, "content");

  if (!title || title.length > 200) {
    return { error: "Tên tác phẩm phải có từ 1 đến 200 ký tự.", message: null };
  }
  if (description.length > 5_000) {
    return { error: "Mô tả quá dài.", message: null };
  }
  if (!content.trim()) {
    return {
      error: "Hãy paste nội dung truyện trước khi tách chương.",
      message: null,
    };
  }
  if (content.length > MAX_PASTE_CHARACTERS) {
    return {
      error: "Nội dung vượt quá giới hạn 5 triệu ký tự.",
      message: null,
    };
  }

  const { supabase, userId } = await requireUser("/import/new");
  const quotaError = await assertUnderJobQuota(supabase, userId);
  if (quotaError) return { error: quotaError, message: null };

  let draft;
  try {
    draft = parseStoryText(content, {
      title,
      description: description || undefined,
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
      error: "Không tìm thấy nội dung chapter để review.",
      message: null,
    };
  }

  const sourceHash = createHash("sha256").update(content).digest("hex");
  const { data: job, error } = await supabase
    .from("import_jobs")
    .insert({
      owner_id: userId,
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
    logEvent("import.job_create_error", { code: error?.code ?? "missing_row" });
    return {
      error: "Chưa thể tạo bản review. Vui lòng thử lại sau.",
      message: null,
    };
  }

  logEvent("import.job_created", {
    chapterCount: draft.stats.chapterCount,
    sectionCount: draft.stats.sectionCount,
  });
  redirect(`/import/review/${job.id}`);
}

export async function createGoogleDocsImport(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = formString(formData, "title").trim();
  const description = formString(formData, "description").trim();
  const url = formString(formData, "url").trim();

  if (!title || title.length > 200) {
    return { error: "Tên tác phẩm phải có từ 1 đến 200 ký tự.", message: null };
  }
  if (description.length > 5_000) {
    return { error: "Mô tả quá dài.", message: null };
  }
  
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const docId = match ? match[1] : null;
  if (!docId) {
    return { error: "Đường link Google Docs không hợp lệ.", message: null };
  }

  const { supabase, userId } = await requireUser("/import/new");
  const quotaError = await assertUnderJobQuota(supabase, userId);
  if (quotaError) return { error: quotaError, message: null };

  let buffer: Buffer;
  try {
    const response = await fetch(`https://docs.google.com/document/export?format=docx&id=${docId}`);
    if (!response.ok) {
      throw new Error("Không thể tải tài liệu. Hãy chắc chắn bạn đã cấp quyền 'Bất kỳ ai có liên kết đều có thể xem'.");
    }
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return { error: `File Google Docs vượt quá giới hạn ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`, message: null };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Lỗi khi tải tài liệu từ Google Docs.", message: null };
  }

  const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const storagePath = `${userId}/${crypto.randomUUID()}.docx`;

  const { data: job, error: insertError } = await supabase
    .from("import_jobs")
    .insert({
      owner_id: userId,
      source_type: "docx",
      source_filename: `Google Docs: ${title}`.slice(0, 255),
      source_hash: sourceHash,
      parser_version: DOCX_PARSER_VERSION,
      status: "parsing",
    })
    .select("id")
    .single();

  if (insertError || !job) {
    logEvent("import.job_create_error", { code: insertError?.code ?? "missing_row" });
    return { error: "Chưa thể tạo bản review. Vui lòng thử lại sau.", message: null };
  }

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });

  if (uploadError) {
    logEvent("import.upload_error", { code: uploadError.name });
    await supabase
      .from("import_jobs")
      .update({ status: "failed", error_message: "upload_failed" })
      .eq("id", job.id);
    return { error: "Không thể lưu file tải về. Vui lòng thử lại.", message: null };
  }

  let draft: ImportDraft;
  try {
    draft = await parseDocxDraft(buffer, { title, description: description || undefined });
    if (draft.stats.chapterCount === 0) {
      throw new Error("Không tìm thấy nội dung chapter để review.");
    }
  } catch (error) {
    await deleteStorageObjectSafely(supabase, storagePath);
    const message = error instanceof Error ? error.message : "Không thể phân tích file Google Docs.";
    await supabase.from("import_jobs").update({ status: "failed", error_message: message }).eq("id", job.id);
    return { error: message, message: null };
  }

  const { error: finalizeError } = await supabase
    .from("import_jobs")
    .update({ status: "needs_review", draft_json: draft, warnings: draft.warnings })
    .eq("id", job.id);

  if (finalizeError) {
    logEvent("import.job_create_error", { code: finalizeError.code });
    return { error: "Chưa thể lưu bản review. Vui lòng thử lại sau.", message: null };
  }

  await deleteStorageObjectSafely(supabase, storagePath);
  logEvent("import.job_created", { chapterCount: draft.stats.chapterCount, sectionCount: draft.stats.sectionCount, sourceType: "google_docs" });
  redirect(`/import/review/${job.id}`);
}

export async function createFileImport(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = formString(formData, "title").trim();
  const description = formString(formData, "description").trim();
  const batchValues = formData.getAll("files");
  const legacyFile = formData.get("file");
  const fileValues =
    batchValues.length > 0
      ? batchValues
      : legacyFile instanceof File
        ? [legacyFile]
        : [];

  if (!title || title.length > 200) {
    return { error: "Tên tác phẩm phải có từ 1 đến 200 ký tự.", message: null };
  }
  if (description.length > 5_000) {
    return { error: "Mô tả quá dài.", message: null };
  }
  if (
    fileValues.length === 0 ||
    fileValues.some((value) => !(value instanceof File) || value.size === 0)
  ) {
    return {
      error: "Hãy chọn ít nhất một file TXT hoặc DOCX trước khi tải lên.",
      message: null,
    };
  }
  if (fileValues.length > MAX_BATCH_FILES) {
    return {
      error: `Mỗi lần chỉ có thể nhập tối đa ${MAX_BATCH_FILES} file.`,
      message: null,
    };
  }
  const files = fileValues as File[];
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_BATCH_UPLOAD_BYTES) {
    return {
      error: `Tổng dung lượng các file vượt quá ${Math.floor(MAX_BATCH_UPLOAD_BYTES / (1024 * 1024))}MB.`,
      message: null,
    };
  }

  const kinds = files.map((file) => detectUploadKind(file.name));
  if (kinds.some((kind) => !kind)) {
    return { error: "Chỉ hỗ trợ file .txt hoặc .docx.", message: null };
  }

  const { supabase, userId } = await requireUser("/import/new");
  const quotaError = await assertUnderJobQuota(supabase, userId);
  if (quotaError) return { error: quotaError, message: null };

  const sources = await Promise.all(
    files.map(async (file, index) => ({
      file,
      kind: kinds[index]!,
      buffer: Buffer.from(await file.arrayBuffer()),
      storagePath: `${userId}/${crypto.randomUUID()}.${kinds[index]}`,
    })),
  );
  const sourceHasher = createHash("sha256");
  for (const source of sources) {
    sourceHasher.update(source.file.name, "utf8");
    sourceHasher.update("\0");
    sourceHasher.update(String(source.buffer.length), "utf8");
    sourceHasher.update("\0");
    sourceHasher.update(source.buffer);
  }
  const sourceHash = sourceHasher.digest("hex");
  const isBatch = sources.length > 1;
  const sourceType = isBatch ? "batch" : sources[0].kind;
  const sourceFilename = isBatch
    ? sources.map(({ file }) => file.name).join(" · ").slice(0, 255)
    : sources[0].file.name.slice(0, 255);

  // Job row + storage upload happen before parsing so a crash mid-parse
  // leaves a recoverable trace (status stays 'parsing') instead of losing
  // the upload silently — see queries.ts's countActiveImportJobs, which
  // this job counts against until it's committed or cancelled.
  const { data: job, error: insertError } = await supabase
    .from("import_jobs")
    .insert({
      owner_id: userId,
      source_type: sourceType,
      source_filename: sourceFilename,
      source_hash: sourceHash,
      parser_version: isBatch
        ? BATCH_PARSER_VERSION
        : sources[0].kind === "docx"
          ? DOCX_PARSER_VERSION
          : TXT_PARSER_VERSION,
      status: "parsing",
    })
    .select("id")
    .single();

  if (insertError || !job) {
    logEvent("import.job_create_error", {
      code: insertError?.code ?? "missing_row",
    });
    return {
      error: "Chưa thể tạo bản review. Vui lòng thử lại sau.",
      message: null,
    };
  }

  const uploadedPaths: string[] = [];
  for (const source of sources) {
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(source.storagePath, source.buffer, {
        contentType:
          source.kind === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "text/plain",
        upsert: false,
      });

    if (uploadError) {
      logEvent("import.upload_error", { code: uploadError.name });
      await Promise.all(
        uploadedPaths.map((path) => deleteStorageObjectSafely(supabase, path)),
      );
      await supabase
        .from("import_jobs")
        .update({ status: "failed", error_message: "upload_failed" })
        .eq("id", job.id);
      return {
        error: "Không thể tải toàn bộ file lên. Vui lòng thử lại.",
        message: null,
      };
    }
    uploadedPaths.push(source.storagePath);
  }

  let draft: ImportDraft;
  try {
    const parsedSources = [];
    for (const source of sources) {
      const fileTitle = isBatch
        ? source.file.name.replace(/\.(?:txt|docx)$/iu, "").slice(0, 200)
        : title;
      let parsed: ImportDraft;
      if (source.kind === "txt") {
        const text = decodeStrictUtf8Text(source.buffer);
        if (text.length > MAX_PASTE_CHARACTERS) {
          throw new Error(
            `File “${source.file.name}” vượt quá giới hạn nội dung.`,
          );
        }
        parsed = parseStoryText(text, {
          title: fileTitle,
          description: isBatch ? undefined : description || undefined,
          sourceType: "txt",
        });
      } else {
        parsed = await parseDocxDraft(source.buffer, {
          title: fileTitle,
          description: isBatch ? undefined : description || undefined,
        });
      }
      parsedSources.push({ filename: source.file.name, draft: parsed });
    }

    draft = isBatch
      ? mergeOrderedImportDrafts(parsedSources, {
          title,
          description: description || undefined,
        })
      : parsedSources[0].draft;
    if (draft.stats.characterCount > MAX_PASTE_CHARACTERS) {
      throw new Error("Tổng nội dung vượt quá giới hạn 5 triệu ký tự.");
    }
    if (draft.stats.chapterCount === 0) {
      throw new Error("Không tìm thấy nội dung chapter để review.");
    }
  } catch (error) {
    await Promise.all(
      uploadedPaths.map((path) => deleteStorageObjectSafely(supabase, path)),
    );
    const message =
      error instanceof Error ? error.message : "Không thể xử lý các file này.";
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
    // Don't delete the uploads here: draft_json never landed, so the raw
    // files in storage are the only remaining copy of what the user
    // submitted. The job stays in 'parsing' for manual recovery.
    logEvent("import.job_create_error", { code: finalizeError.code });
    return {
      error: "Chưa thể lưu bản review. Vui lòng thử lại sau.",
      message: null,
    };
  }

  await Promise.all(
    uploadedPaths.map((path) => deleteStorageObjectSafely(supabase, path)),
  );

  logEvent("import.job_created", {
    chapterCount: draft.stats.chapterCount,
    sectionCount: draft.stats.sectionCount,
    sourceType,
    fileCount: sources.length,
  });
  redirect(`/import/review/${job.id}`);
}

export async function reviewImportDraft(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const jobId = formString(formData, "jobId");
  const intent = formString(formData, "intent");
  const structureRaw = formString(formData, "structure");
  const contentOpsRaw = formString(formData, "contentOps");
  if (!UUID_RE.test(jobId)) {
    return { error: "Import job không hợp lệ.", message: null };
  }

  const reviewPath = `/import/review/${jobId}`;
  const { supabase, userId } = await requireUser(reviewPath);
  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .select("id, owner_id, status, draft_json")
    .eq("id", jobId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (jobError || !job) {
    return { error: "Không tìm thấy bản import này.", message: null };
  }

  let draft;
  try {
    const structure = JSON.parse(structureRaw) as unknown;
    const contentOps = contentOpsRaw
      ? (JSON.parse(contentOpsRaw) as unknown)
      : [];
    draft = applyReviewSubmission(job.draft_json, structure, contentOps);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Bản review không hợp lệ.",
      message: null,
    };
  }

  if (draft.stats.chapterCount === 0) {
    return {
      error: "Cần giữ lại ít nhất một chapter trước khi commit.",
      message: null,
    };
  }

  if (intent === "commit") {
    const emptyChapterCount = countEmptyChapters(draft.sections);
    if (emptyChapterCount > 0) {
      return {
        error: `Còn ${emptyChapterCount} chapter rỗng — hãy xóa hoặc gộp trước khi commit.`,
        message: null,
      };
    }
  }

  if (intent === "save") {
    const { data: updated, error } = await supabase
      .from("import_jobs")
      .update({ draft_json: draft, warnings: draft.warnings })
      .eq("id", jobId)
      .eq("owner_id", userId)
      .eq("status", "needs_review")
      .select("id")
      .maybeSingle();
    if (error || !updated) {
      return {
        error:
          "Chưa thể lưu thay đổi. Bản import có thể đã được commit ở nơi khác.",
        message: null,
      };
    }
    revalidatePath(reviewPath);
    return { error: null, message: "Đã lưu bản review." };
  }

  if (intent !== "commit") return EMPTY_STATE;

  // Persist the freshly re-normalized draft (content_blocks/content_hash
  // recomputed server-side from contentText by normalizeImportDraft above,
  // never trusted from the client) before committing, so the RPC — which
  // reads draft_json off the job row rather than taking it as a parameter —
  // commits exactly what was just reviewed, not a possibly-stale blob from
  // this request. See supabase/migrations/0006_slice2_commit_contract.sql.
  const { data: persisted, error: persistError } = await supabase
    .from("import_jobs")
    .update({ draft_json: draft, warnings: draft.warnings })
    .eq("id", jobId)
    .eq("owner_id", userId)
    .eq("status", "needs_review")
    .select("id")
    .maybeSingle();

  if (persistError) {
    logEvent("import.commit_error", { code: persistError.code });
    return {
      error: "Không thể hoàn tất import. Bản nháp vẫn được giữ để thử lại.",
      message: null,
    };
  }

  if (!persisted) {
    // No needs_review row matched — either a duplicate submission already
    // completed this job, or it moved to some other state. Only the former
    // is safe to continue: the RPC's completed-job branch is idempotent.
    const { data: current } = await supabase
      .from("import_jobs")
      .select("status")
      .eq("id", jobId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (current?.status !== "completed") {
      return {
        error:
          "Bản import không còn ở trạng thái có thể commit. Hãy tải lại trang.",
        message: null,
      };
    }
  }

  const { data, error } = await supabase.rpc("commit_import_job", {
    p_job_id: jobId,
  });
  const result = Array.isArray(data) ? data[0] : data;
  const storyId = result?.story_id;
  if (error || !storyId) {
    logEvent("import.commit_error", { code: error?.code ?? "missing_result" });
    return {
      error: "Không thể hoàn tất import. Bản nháp vẫn được giữ để thử lại.",
      message: null,
    };
  }

  revalidatePath("/library");
  revalidatePath(reviewPath);
  logEvent("import.commit_success", { chapterCount: draft.stats.chapterCount });
  redirect(`/read/${storyId}`);
}

export async function cancelImportJob(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const jobId = formString(formData, "jobId");
  if (!UUID_RE.test(jobId)) {
    return { error: "Import job không hợp lệ.", message: null };
  }

  const { supabase, userId } = await requireUser("/import");
  const { data: updated, error } = await supabase
    .from("import_jobs")
    .update({
      status: "cancelled",
      draft_json: null,
      warnings: [],
      error_message: null,
    })
    .eq("id", jobId)
    .eq("owner_id", userId)
    .in("status", CANCELLABLE_STATUSES)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return {
      error:
        "Không thể hủy bản nháp này — có thể đã được commit hoặc hủy ở nơi khác.",
      message: null,
    };
  }

  logEvent("import.job_cancelled");
  revalidatePath("/import");
  redirect("/import");
}
