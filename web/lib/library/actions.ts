"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logEvent } from "@/lib/telemetry";
import type { Json } from "@/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  WRITING_STATUS_VALUES,
  type WritingStatus,
} from "@/lib/writing-status";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ActionState = {
  error: string | null;
  message: string | null;
};

const EMPTY_STATE: ActionState = { error: null, message: null };
const WRITING_STATUS_SET = new Set<string>(WRITING_STATUS_VALUES);

function isMissingWritingStatusError(
  error: { code?: string; message?: string } | null,
) {
  return Boolean(
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      error.message?.includes("writing_status")),
  );
}

/**
 * Hard, permanent delete — stories_delete_own RLS + the FK cascades already
 * in place (sections/chapters/chapter_revisions/reading_progress/
 * chapter_read_states/story_versions all `on delete cascade` from stories)
 * make this safe and complete; only import_jobs.story_id gets set to null
 * (its FK is `on delete set null`), which intentionally preserves import
 * history/audit trail rather than cascading. For anything reversible, see
 * archiveStory below instead.
 */
export async function deleteStory(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const storyId = formData.get("storyId");
  if (typeof storyId !== "string" || !UUID_RE.test(storyId)) {
    return { error: "Tác phẩm không hợp lệ.", message: null };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) {
    redirect(`/auth/login?next=/library`);
  }

  const { error, count } = await supabase
    .from("stories")
    .delete({ count: "exact" })
    .eq("id", storyId)
    .eq("owner_id", userId);

  if (error || !count) {
    logEvent("library.delete_story_error", {
      code: error?.code ?? "not_found",
    });
    return {
      error: "Không thể xoá tác phẩm này. Vui lòng thử lại.",
      message: null,
    };
  }

  logEvent("library.story_deleted", { storyId });
  revalidatePath("/library");
  return EMPTY_STATE;
}

async function setStoryStatus(
  formData: FormData,
  status: "active" | "archived",
  eventName: string,
): Promise<ActionState> {
  const storyId = formData.get("storyId");
  if (typeof storyId !== "string" || !UUID_RE.test(storyId)) {
    return { error: "Tác phẩm không hợp lệ.", message: null };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) {
    redirect(`/auth/login?next=/library`);
  }

  const { error, count } = await supabase
    .from("stories")
    .update({ status }, { count: "exact" })
    .eq("id", storyId)
    .eq("owner_id", userId);

  if (error || !count) {
    logEvent(`${eventName}_error`, { code: error?.code ?? "not_found" });
    return {
      error: "Không thể cập nhật tác phẩm này. Vui lòng thử lại.",
      message: null,
    };
  }

  logEvent(eventName, { storyId });
  revalidatePath("/library");
  return EMPTY_STATE;
}

/** Reversible alternative to deleteStory — hides the story from the active
 * library list without touching any of its chapters/progress/history. */
export async function archiveStory(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return setStoryStatus(formData, "archived", "library.story_archived");
}

export async function restoreStory(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return setStoryStatus(formData, "active", "library.story_restored");
}

export async function updateStoryWritingStatus(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const storyId = formData.get("storyId");
  if (typeof storyId !== "string" || !UUID_RE.test(storyId)) {
    return { error: "Tác phẩm không hợp lệ.", message: null };
  }

  const nextStatus = formData.get("writingStatus");
  if (typeof nextStatus !== "string" || !WRITING_STATUS_SET.has(nextStatus)) {
    return { error: "Trạng thái sáng tác không hợp lệ.", message: null };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) {
    redirect(`/auth/login?next=/library`);
  }

  const { error, count } = await supabase
    .from("stories")
    .update({ writing_status: nextStatus as WritingStatus }, { count: "exact" })
    .eq("id", storyId)
    .eq("owner_id", userId);

  if (error || !count) {
    if (isMissingWritingStatusError(error)) {
      logEvent("library.writing_status_missing_on_update", {
        code: error?.code ?? "missing_column",
      });
      return {
        error:
          "Chưa thể lưu tiến trình sáng tác vì database hosted chưa có migration mới.",
        message: null,
      };
    }

    logEvent("library.writing_status_update_error", {
      code: error?.code ?? "not_found",
    });
    return {
      error: "Không thể cập nhật tiến trình sáng tác. Vui lòng thử lại.",
      message: null,
    };
  }

  logEvent("library.writing_status_updated", {
    storyId,
    writingStatus: nextStatus,
  });
  revalidatePath("/library");
  revalidatePath("/search");
  return { error: null, message: "Đã cập nhật tiến trình sáng tác." };
}

export async function updateStoryCoverColor(storyId: string, color: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error: updateError } = await supabase
    .from("stories")
    .update({ cover_image_url: color })
    .eq("id", storyId)
    .eq("owner_id", user.id);

  if (updateError) return { error: "Database update failed: " + updateError.message };

  revalidatePath("/library");
  return { success: true };
}

export type UpdateStorySectionInput = {
  storyId: string;
  sectionId: string;
  title: string;
  parentSectionId: string | null;
};

export async function updateStorySection(
  input: UpdateStorySectionInput,
): Promise<ActionState> {
  if (!input || typeof input !== "object") {
    return { error: "Section không hợp lệ.", message: null };
  }

  const { storyId, sectionId, parentSectionId } = input;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (
    !UUID_RE.test(storyId) ||
    !UUID_RE.test(sectionId) ||
    title.length === 0 ||
    title.length > 200 ||
    (parentSectionId !== null && !UUID_RE.test(parentSectionId)) ||
    parentSectionId === sectionId
  ) {
    return { error: "Tên hoặc section cha không hợp lệ.", message: null };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) redirect(`/auth/login?next=/library/${storyId}/chapters`);

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id")
    .eq("id", storyId)
    .eq("owner_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (storyError || !story) {
    return { error: "Không tìm thấy tác phẩm để cập nhật.", message: null };
  }

  const { data: sections, error: sectionsError } = await supabase
    .from("sections")
    .select("id, parent_section_id, type")
    .eq("story_id", storyId)
    .eq("is_active", true);
  if (sectionsError) {
    logEvent("library.section_update_lookup_error", {
      code: sectionsError.code,
      storyId,
      sectionId,
    });
    return { error: "Không thể kiểm tra cấu trúc section.", message: null };
  }

  const target = sections?.find((section) => section.id === sectionId);
  if (!target) {
    return { error: "Không tìm thấy section để cập nhật.", message: null };
  }

  if (parentSectionId !== null) {
    const parent = sections?.find((section) => section.id === parentSectionId);
    const targetHasChildren = sections?.some(
      (section) => section.parent_section_id === sectionId,
    );
    if (
      !parent ||
      parent.parent_section_id !== null ||
      target.type === "volume" ||
      targetHasChildren
    ) {
      return {
        error:
          "Chỉ có thể đặt một section lá bên trong section cấp gốc.",
        message: null,
      };
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("sections")
    .update({ title, parent_section_id: parentSectionId })
    .eq("id", sectionId)
    .eq("story_id", storyId)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    logEvent("library.section_update_error", {
      code: updateError?.code ?? "not_found",
      storyId,
      sectionId,
    });
    return {
      error: "Không thể cập nhật section. Vui lòng thử lại.",
      message: null,
    };
  }

  logEvent("library.section_updated", {
    storyId,
    sectionId,
    hasParent: parentSectionId !== null,
  });
  revalidatePath(`/library/${storyId}/chapters`);
  revalidatePath(`/read/${storyId}`);
  revalidatePath(`/read/${storyId}/graph`);
  revalidatePath("/library/graphs");
  revalidatePath("/library");
  revalidatePath("/search");
  return { error: null, message: "Đã cập nhật section." };
}

export async function reorderStoryChapters(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const storyId = formData.get("storyId");
  const orderRaw = formData.get("order");
  if (typeof storyId !== "string" || !UUID_RE.test(storyId)) {
    return { error: "Tác phẩm không hợp lệ.", message: null };
  }
  if (typeof orderRaw !== "string" || orderRaw.length > 2_000_000) {
    return { error: "Thứ tự chương không hợp lệ.", message: null };
  }

  let order: unknown;
  try {
    order = JSON.parse(orderRaw);
  } catch {
    return { error: "Thứ tự chương không hợp lệ.", message: null };
  }
  if (!Array.isArray(order)) {
    return { error: "Thứ tự chương không hợp lệ.", message: null };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect(`/auth/login?next=/library/${storyId}/chapters`);

  const { data: count, error } = await supabase.rpc("reorder_story_chapters", {
    p_story_id: storyId,
    p_sections: order as Json,
  });
  if (error) {
    logEvent("library.chapter_order_update_error", { code: error.code });
    return {
      error:
        error.code === "KD006"
          ? "Danh sách chương đã thay đổi ở nơi khác. Hãy tải lại trang rồi thử lại."
          : "Không thể lưu thứ tự chương. Vui lòng thử lại.",
      message: null,
    };
  }

  logEvent("library.chapter_order_updated", {
    storyId,
    chapterCount: count ?? 0,
  });
  revalidatePath(`/library/${storyId}/chapters`);
  revalidatePath(`/read/${storyId}`);
  revalidatePath("/library");
  return { error: null, message: `Đã lưu thứ tự ${count ?? 0} chương.` };
}
