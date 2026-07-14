import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";

export type ImportJobSummary = {
  id: string;
  source_type: Database["public"]["Enums"]["import_source_type"];
  source_filename: string | null;
  status: Database["public"]["Enums"]["import_job_status"];
  story_id: string | null;
  created_at: string;
  updated_at: string;
};

export const CANCELLABLE_STATUSES = [
  "uploaded",
  "parsing",
  "needs_review",
  "failed",
] as const;

export function isCancellableStatus(status: string): boolean {
  return (CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

export async function listImportJobs(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<ImportJobSummary[]> {
  const { data } = await supabase
    .from("import_jobs")
    .select(
      "id, source_type, source_filename, status, story_id, created_at, updated_at",
    )
    .eq("owner_id", ownerId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

// Every import_job row holds a full draft_json (whole-story prose) until
// it's committed or cancelled — this bounds how many a single owner can
// have outstanding at once, independent of file size, so abandoned drafts
// can't accumulate unboundedly.
export const MAX_ACTIVE_IMPORT_JOBS = 20;

export async function countActiveImportJobs(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<number> {
  const { count } = await supabase
    .from("import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .not("status", "in", "(completed,cancelled)");

  return count ?? 0;
}
