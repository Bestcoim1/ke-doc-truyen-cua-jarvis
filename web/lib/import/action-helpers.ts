import { redirect } from "next/navigation";

import { logEvent } from "@/lib/telemetry";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { countActiveImportJobs, MAX_ACTIVE_IMPORT_JOBS } from "./queries";
import type { DraftSection } from "./text-parser";

// Shared by first-time and re-import file-upload actions — a single
// source of truth so the two flows can't silently drift (e.g. one
// forgetting a parser_version bump the other got).
export const STORAGE_BUCKET = "story-sources";
export const DOCX_PARSER_VERSION = "docx-heading-v1";
export const TXT_PARSER_VERSION = "txt-utf8-v1";
export const BATCH_PARSER_VERSION = "multi-file-v1";

// Deliberately NOT a "use server" file: Next.js requires every export of a
// "use server" module to be an async function (a plain constant like
// UUID_RE or a sync helper like formString breaks the whole module's
// exports in that context — confirmed by `next build` failing with "module
// has no exports at all" when these lived in actions.ts alongside its
// server actions). Shared by lib/import/actions.ts and
// lib/import/reimport-actions.ts, both "use server" files; safe here since
// nothing in this file is ever imported by a "use client" component
// directly, and requireUser/assertUnderJobQuota only touch server-only
// APIs (next/headers cookies via createClient).

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function requireUser(nextPath: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }
  return { supabase, userId };
}

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function countEmptyChapters(sections: DraftSection[]): number {
  return sections.reduce(
    (total, section) =>
      total +
      section.chapters.filter((chapter) => !chapter.contentText.trim()).length +
      countEmptyChapters(section.children),
    0,
  );
}

export async function assertUnderJobQuota(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const activeCount = await countActiveImportJobs(supabase, userId);
  if (activeCount >= MAX_ACTIVE_IMPORT_JOBS) {
    return `Bạn có ${activeCount} bản nháp đang chờ — hãy commit hoặc hủy bớt trước khi tạo bản mới.`;
  }
  return null;
}

export async function deleteStorageObjectSafely(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path]);
    if (error) logEvent("import.storage_cleanup_error", { code: error.name });
  } catch {
    logEvent("import.storage_cleanup_error", { code: "exception" });
  }
}
