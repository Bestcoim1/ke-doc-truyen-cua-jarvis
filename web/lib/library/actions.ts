"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logEvent } from "@/lib/telemetry";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ActionState = {
  error: string | null;
  message: string | null;
};

const EMPTY_STATE: ActionState = { error: null, message: null };

/**
 * Hard delete — stories_delete_own RLS + the FK cascades already in place
 * (sections/chapters/chapter_revisions/reading_progress/chapter_read_states/
 * story_versions all `on delete cascade` from stories) make this safe and
 * complete; only import_jobs.story_id gets set to null (its FK is `on
 * delete set null`), which intentionally preserves import history/audit
 * trail rather than cascading. No soft-delete state machine exists to use
 * instead (story_status has unused 'archived'/'deleting' values, but
 * nothing implements a lifecycle around them — building that isn't what
 * was asked for here).
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
    logEvent("library.delete_story_error", { code: error?.code ?? "not_found" });
    return { error: "Không thể xoá tác phẩm này. Vui lòng thử lại.", message: null };
  }

  logEvent("library.story_deleted", { storyId });
  revalidatePath("/library");
  return EMPTY_STATE;
}
