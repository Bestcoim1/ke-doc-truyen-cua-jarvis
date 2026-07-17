import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";

export type ImportJobSummary = {
  id: string;
  source_type: Database["public"]["Enums"]["import_source_type"];
  source_filename: string | null;
  status: Database["public"]["Enums"]["import_job_status"];
  created_at: string;
  updated_at: string;
};

export const CANCELLABLE_STATUSES = [
  "uploaded",
  "parsing",
  "needs_review",
  "failed",
] as const;

export const ACTIVE_IMPORT_STATUSES = [
  "uploaded",
  "parsing",
  "needs_review",
  "committing",
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
      "id, source_type, source_filename, status, created_at, updated_at",
    )
    .eq("owner_id", ownerId)
    .in("status", ACTIVE_IMPORT_STATUSES)
    .order("created_at", { ascending: false })
    .limit(MAX_ACTIVE_IMPORT_JOBS);

  return data ?? [];
}

// Every import_job row holds a full draft_json (whole-story prose) until
// it's committed or cancelled — this bounds how many a single owner can
// have outstanding at once, independent of file size, so abandoned drafts
// can't accumulate unboundedly.
export const MAX_ACTIVE_IMPORT_JOBS = 5;

export function staleImportJobIds(
  jobs: Array<{ id: string }>,
  keep = MAX_ACTIVE_IMPORT_JOBS,
): string[] {
  return jobs.slice(Math.max(0, keep)).map((job) => job.id);
}

export async function pruneActiveImportJobs(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  keep = MAX_ACTIVE_IMPORT_JOBS,
): Promise<{ pruned: number; error: string | null }> {
  const { data, error: listError } = await supabase
    .from("import_jobs")
    .select("id")
    .eq("owner_id", ownerId)
    .in("status", ACTIVE_IMPORT_STATUSES)
    .order("created_at", { ascending: false });
  if (listError) return { pruned: 0, error: listError.message };

  const staleIds = staleImportJobIds(data ?? [], keep);
  if (staleIds.length === 0) return { pruned: 0, error: null };

  const { data: cancelled, error: cancelError } = await supabase
    .from("import_jobs")
    .update({
      status: "cancelled",
      draft_json: null,
      warnings: [],
      error_message: null,
    })
    .eq("owner_id", ownerId)
    .in("id", staleIds)
    .in("status", ACTIVE_IMPORT_STATUSES)
    .select("id");

  return {
    pruned: cancelled?.length ?? 0,
    error: cancelError?.message ?? null,
  };
}

export async function countActiveImportJobs(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<number> {
  const { count } = await supabase
    .from("import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .in("status", ACTIVE_IMPORT_STATUSES);

  return count ?? 0;
}
