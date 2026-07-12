import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/database.types";
import { parseStoryText, type DraftSection, type ImportDraft } from "../../lib/import/text-parser";
import { createTestClient, USER_A_EMAIL, USER_A_PASSWORD, USER_B_EMAIL, USER_B_PASSWORD } from "./env";

function findChapterId(sections: DraftSection[], title: string): string {
  for (const section of sections) {
    const found = section.chapters.find((c) => c.title === title);
    if (found) return found.id;
    try {
      return findChapterId(section.children, title);
    } catch {
      // keep looking in siblings
    }
  }
  throw new Error(`chapter not found in draft: ${title}`);
}

async function computeBaseTreeToken(client: SupabaseClient<Database>, storyId: string): Promise<string> {
  const [{ data: chapters, error: chError }, { data: sections, error: secError }] = await Promise.all([
    client.from("chapters").select("updated_at").eq("story_id", storyId).eq("is_active", true),
    client.from("sections").select("updated_at").eq("story_id", storyId).eq("is_active", true),
  ]);
  if (chError || secError) throw chError ?? secError;
  const timestamps = [...(chapters ?? []), ...(sections ?? [])].map((row) => row.updated_at);
  if (timestamps.length === 0) throw new Error("story has no active rows to derive a tree token from");
  // ISO 8601 timestamps sort lexicographically in chronological order.
  return timestamps.sort().at(-1)!;
}

async function commitFreshStory(
  client: SupabaseClient<Database>,
  ownerId: string,
  title: string,
  draft: ImportDraft,
): Promise<{ storyId: string; jobId: string }> {
  const { data: job, error: jobError } = await client
    .from("import_jobs")
    .insert({
      owner_id: ownerId,
      source_type: "paste",
      parser_version: "test-v1",
      status: "needs_review",
      draft_json: draft,
      warnings: draft.warnings,
    })
    .select("id")
    .single();
  if (jobError) throw jobError;

  const { data, error } = await client.rpc("commit_import_job", { p_job_id: job!.id });
  if (error) throw error;
  return { storyId: data![0].story_id, jobId: job!.id };
}

async function createReimportJob(
  client: SupabaseClient<Database>,
  ownerId: string,
  storyId: string,
  draft: ImportDraft,
  mapping: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await client
    .from("import_jobs")
    .insert({
      owner_id: ownerId,
      story_id: storyId,
      source_type: "paste",
      parser_version: "test-v1",
      status: "needs_review",
      draft_json: draft,
      mapping_json: mapping as unknown as Json,
      warnings: draft.warnings,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

function fiveChapterDraft(title: string): ImportDraft {
  return parseStoryText(
    `Hồi 1
Chương 1
Nội dung chương một.

Chương 2
Nội dung chương hai.

Chương 3
Nội dung chương ba.

Chương 4
Nội dung chương bốn.

Chương 5
Nội dung chương năm.`,
    { title, sourceType: "paste" },
  );
}

describe("re-import commit RPC", () => {
  it("AC-UPD-01: keeps chapter identity, creates revisions only where content changed, adds new chapters", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;

    const oldDraft = fiveChapterDraft("AC-UPD-01 story");
    const { storyId } = await commitFreshStory(client, ownerId, "AC-UPD-01 story", oldDraft);

    try {
      const { data: oldChapters } = await client
        .from("chapters")
        .select("id, title")
        .eq("story_id", storyId)
        .eq("is_active", true);
      expect(oldChapters).toHaveLength(5);
      const oldIdByTitle = new Map(oldChapters!.map((c) => [c.title, c.id]));

      const baseTreeToken = await computeBaseTreeToken(client, storyId);

      // New draft: chapters 1/2/3 changed content, 4/5 unchanged, plus two brand-new chapters.
      const newDraft = parseStoryText(
        `Hồi 1
Chương 1
Nội dung chương một đã sửa.

Chương 2
Nội dung chương hai đã sửa.

Chương 3
Nội dung chương ba đã sửa.

Chương 4
Nội dung chương bốn.

Chương 5
Nội dung chương năm.

Chương 6
Nội dung chương sáu, hoàn toàn mới.

Chương 7
Nội dung chương bảy, hoàn toàn mới.`,
        { title: "AC-UPD-01 story", sourceType: "paste" },
      );

      const decisions = [1, 2, 3, 4, 5].map((n) => ({
        kind: "primary",
        newChapterId: findChapterId(newDraft.sections, `Chương ${n}`),
        oldChapterId: oldIdByTitle.get(`Chương ${n}`),
      }));

      const jobId = await createReimportJob(client, ownerId, storyId, newDraft, {
        version: 1,
        baseTreeToken,
        decisions,
      });

      const result = await client.rpc("commit_reimport_job", { p_job_id: jobId });
      expect(result.error).toBeNull();
      expect(result.data![0].story_id).toBe(storyId);

      const { data: versions } = await client
        .from("story_versions")
        .select("version_number")
        .eq("story_id", storyId)
        .order("version_number");
      expect(versions?.map((v) => v.version_number)).toEqual([1, 2]);

      const { data: newChapters } = await client
        .from("chapters")
        .select("id, title, current_revision_id")
        .eq("story_id", storyId)
        .eq("is_active", true);
      expect(newChapters).toHaveLength(7);

      // The 5 originally-matched chapters keep their DB ids.
      for (const n of [1, 2, 3, 4, 5]) {
        const row = newChapters!.find((c) => c.title === `Chương ${n}`);
        expect(row?.id).toBe(oldIdByTitle.get(`Chương ${n}`));
      }
      // Chapters 6/7 are brand new ids.
      const newIds = new Set(newChapters!.map((c) => c.id));
      expect(newIds.has(oldIdByTitle.get("Chương 1")!)).toBe(true);
      for (const n of [6, 7]) {
        const row = newChapters!.find((c) => c.title === `Chương ${n}`);
        expect(Array.from(oldIdByTitle.values())).not.toContain(row?.id);
      }

      // Chapters 4/5 (unchanged content) kept their original revision id.
      const { data: originalRevisions } = await client
        .from("chapters")
        .select("id, current_revision_id")
        .in("id", [oldIdByTitle.get("Chương 4")!, oldIdByTitle.get("Chương 5")!]);
      // We don't have the pre-commit revision ids handy here, so instead
      // assert there's still exactly one revision per unchanged chapter.
      for (const row of originalRevisions ?? []) {
        const { data: revisions } = await client
          .from("chapter_revisions")
          .select("id")
          .eq("chapter_id", row.id);
        expect(revisions).toHaveLength(1);
      }
      // Chapters 1/2/3 (changed content) now have two revisions each.
      for (const n of [1, 2, 3]) {
        const { data: revisions } = await client
          .from("chapter_revisions")
          .select("id")
          .eq("chapter_id", oldIdByTitle.get(`Chương ${n}`)!);
        expect(revisions).toHaveLength(2);
      }
    } finally {
      await client.from("stories").delete().eq("id", storyId);
    }
  });

  it("AC-UPD-02: blocks commit until an orphaned old chapter's disposition is confirmed, then archives (not deletes) it", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;

    const oldDraft = fiveChapterDraft("AC-UPD-02 story");
    const { storyId } = await commitFreshStory(client, ownerId, "AC-UPD-02 story", oldDraft);

    try {
      const { data: oldChapters } = await client
        .from("chapters")
        .select("id, title")
        .eq("story_id", storyId)
        .eq("is_active", true);
      const oldIdByTitle = new Map(oldChapters!.map((c) => [c.title, c.id]));
      const droppedChapterId = oldIdByTitle.get("Chương 5")!;

      // New draft drops "Chương 5" entirely — the other 4 stay unchanged.
      const newDraft = fiveChapterDraft("AC-UPD-02 story");
      newDraft.sections[0].chapters = newDraft.sections[0].chapters.filter(
        (c) => c.title !== "Chương 5",
      );

      const decisionsWithoutDisposition = [1, 2, 3, 4].map((n) => ({
        kind: "primary",
        newChapterId: findChapterId(newDraft.sections, `Chương ${n}`),
        oldChapterId: oldIdByTitle.get(`Chương ${n}`),
      }));

      const baseTreeToken1 = await computeBaseTreeToken(client, storyId);
      const jobId1 = await createReimportJob(client, ownerId, storyId, newDraft, {
        version: 1,
        baseTreeToken: baseTreeToken1,
        decisions: decisionsWithoutDisposition,
      });

      const blocked = await client.rpc("commit_reimport_job", { p_job_id: jobId1 });
      expect(blocked.error).not.toBeNull();
      expect(blocked.error?.code).toBe("KD003");

      // Same story, same base tree (nothing committed yet) — retry with an
      // explicit archive decision for the dropped chapter.
      const baseTreeToken2 = await computeBaseTreeToken(client, storyId);
      expect(baseTreeToken2).toBe(baseTreeToken1);
      const jobId2 = await createReimportJob(client, ownerId, storyId, newDraft, {
        version: 1,
        baseTreeToken: baseTreeToken2,
        decisions: [...decisionsWithoutDisposition, { kind: "archived", oldChapterId: droppedChapterId }],
      });

      const committed = await client.rpc("commit_reimport_job", { p_job_id: jobId2 });
      expect(committed.error).toBeNull();

      const { data: droppedRow } = await client
        .from("chapters")
        .select("is_active, archived_in_version_id")
        .eq("id", droppedChapterId)
        .single();
      expect(droppedRow?.is_active).toBe(false);
      expect(droppedRow?.archived_in_version_id).toBeTruthy();

      const { data: activeChapters } = await client
        .from("chapters")
        .select("id")
        .eq("story_id", storyId)
        .eq("is_active", true);
      expect(activeChapters).toHaveLength(4);

      // The archived chapter's revision history still exists (soft delete only).
      const { data: revisions } = await client
        .from("chapter_revisions")
        .select("id")
        .eq("chapter_id", droppedChapterId);
      expect(revisions!.length).toBeGreaterThan(0);
    } finally {
      await client.from("stories").delete().eq("id", storyId);
    }
  });

  it("AC-UPD-04: re-importing byte-identical content creates no duplicate chapters or revisions", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;

    const draft = fiveChapterDraft("AC-UPD-04 story");
    const { storyId } = await commitFreshStory(client, ownerId, "AC-UPD-04 story", draft);

    try {
      const { data: oldChapters } = await client
        .from("chapters")
        .select("id, title")
        .eq("story_id", storyId)
        .eq("is_active", true);
      const oldIdByTitle = new Map(oldChapters!.map((c) => [c.title, c.id]));

      const identicalDraft = fiveChapterDraft("AC-UPD-04 story");
      const decisions = [1, 2, 3, 4, 5].map((n) => ({
        kind: "primary",
        newChapterId: findChapterId(identicalDraft.sections, `Chương ${n}`),
        oldChapterId: oldIdByTitle.get(`Chương ${n}`),
      }));
      const baseTreeToken = await computeBaseTreeToken(client, storyId);
      const jobId = await createReimportJob(client, ownerId, storyId, identicalDraft, {
        version: 1,
        baseTreeToken,
        decisions,
      });

      const result = await client.rpc("commit_reimport_job", { p_job_id: jobId });
      expect(result.error).toBeNull();

      const { data: chaptersAfter } = await client
        .from("chapters")
        .select("id")
        .eq("story_id", storyId)
        .eq("is_active", true);
      expect(chaptersAfter).toHaveLength(5);

      for (const n of [1, 2, 3, 4, 5]) {
        const { data: revisions } = await client
          .from("chapter_revisions")
          .select("id")
          .eq("chapter_id", oldIdByTitle.get(`Chương ${n}`)!);
        expect(revisions).toHaveLength(1);
      }

      // Retrying the same completed job is idempotent — no second version.
      // The retry branch intentionally returns an empty chapter_id_pairs
      // (Đợt 2's remap already ran off the first call's pairs; a mere
      // retry has nothing new to remap), so only story_id/version_id are
      // compared here.
      const retry = await client.rpc("commit_reimport_job", { p_job_id: jobId });
      expect(retry.error).toBeNull();
      expect(retry.data![0]).toMatchObject({
        story_id: result.data![0].story_id,
        version_id: result.data![0].version_id,
      });

      const { data: versions } = await client
        .from("story_versions")
        .select("id")
        .eq("story_id", storyId);
      expect(versions).toHaveLength(2); // v1 (initial) + v2 (this re-import), not 3
    } finally {
      await client.from("stories").delete().eq("id", storyId);
    }
  });

  it("rejects a stale mapping computed before a concurrent change to the story", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;

    const draft = fiveChapterDraft("Staleness story");
    const { storyId } = await commitFreshStory(client, ownerId, "Staleness story", draft);

    try {
      const { data: oldChapters } = await client
        .from("chapters")
        .select("id, title")
        .eq("story_id", storyId)
        .eq("is_active", true);
      const oldIdByTitle = new Map(oldChapters!.map((c) => [c.title, c.id]));

      const staleBaseTreeToken = await computeBaseTreeToken(client, storyId);

      // Simulate an unrelated change to the story after the mapping was
      // computed (e.g. edited in another tab) — bumps a chapter's updated_at.
      await client
        .from("chapters")
        .update({ title: "Chương 1" }) // no-op value change still bumps updated_at via the trigger
        .eq("id", oldIdByTitle.get("Chương 1")!);

      const newDraft = fiveChapterDraft("Staleness story");
      const decisions = [1, 2, 3, 4, 5].map((n) => ({
        kind: "primary",
        newChapterId: findChapterId(newDraft.sections, `Chương ${n}`),
        oldChapterId: oldIdByTitle.get(`Chương ${n}`),
      }));
      const jobId = await createReimportJob(client, ownerId, storyId, newDraft, {
        version: 1,
        baseTreeToken: staleBaseTreeToken,
        decisions,
      });

      const result = await client.rpc("commit_reimport_job", { p_job_id: jobId });
      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe("KD001");
    } finally {
      await client.from("stories").delete().eq("id", storyId);
    }
  });

  it("rejects a mapping that maps more than one new chapter to the same old chapter", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;

    const draft = fiveChapterDraft("Injectivity story");
    const { storyId } = await commitFreshStory(client, ownerId, "Injectivity story", draft);

    try {
      const { data: oldChapters } = await client
        .from("chapters")
        .select("id, title")
        .eq("story_id", storyId)
        .eq("is_active", true);
      const oldIdByTitle = new Map(oldChapters!.map((c) => [c.title, c.id]));

      const newDraft = fiveChapterDraft("Injectivity story");
      const decisions = [1, 2, 3, 4, 5].map((n) => ({
        kind: "primary",
        newChapterId: findChapterId(newDraft.sections, `Chương ${n}`),
        // Bug: chapters 1 and 2 both point at old chapter 1, without a
        // "merged" kind confirming that as an intentional merge.
        oldChapterId: n === 2 ? oldIdByTitle.get("Chương 1") : oldIdByTitle.get(`Chương ${n}`),
      }));
      const baseTreeToken = await computeBaseTreeToken(client, storyId);
      const jobId = await createReimportJob(client, ownerId, storyId, newDraft, {
        version: 1,
        baseTreeToken,
        decisions,
      });

      const result = await client.rpc("commit_reimport_job", { p_job_id: jobId });
      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe("KD002");
    } finally {
      await client.from("stories").delete().eq("id", storyId);
    }
  });

  it("rejects commit_reimport_job when the job has no target story (use commit_import_job instead)", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;
    const draft = fiveChapterDraft("No target story job");

    const { data: job, error: jobError } = await client
      .from("import_jobs")
      .insert({
        owner_id: ownerId,
        source_type: "paste",
        parser_version: "test-v1",
        status: "needs_review",
        draft_json: draft,
        warnings: draft.warnings,
      })
      .select("id")
      .single();
    expect(jobError).toBeNull();

    try {
      const result = await client.rpc("commit_reimport_job", { p_job_id: job!.id });
      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe("22023");
    } finally {
      await client.from("import_jobs").delete().eq("id", job!.id);
    }
  });

  it("rejects a re-import commit attempt from a user who does not own the story", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();

    const { data: signInA, error: signInAError } = await clientA.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInAError).toBeNull();
    const { data: signInB, error: signInBError } = await clientB.auth.signInWithPassword({
      email: USER_B_EMAIL,
      password: USER_B_PASSWORD,
    });
    expect(signInBError).toBeNull();
    const ownerAId = signInA.user!.id;

    const draft = fiveChapterDraft("Non-owner re-import story");
    const { storyId } = await commitFreshStory(clientA, ownerAId, "Non-owner re-import story", draft);

    try {
      const { data: oldChapters } = await clientA
        .from("chapters")
        .select("id, title")
        .eq("story_id", storyId)
        .eq("is_active", true);
      const oldIdByTitle = new Map(oldChapters!.map((c) => [c.title, c.id]));
      const newDraft = fiveChapterDraft("Non-owner re-import story");
      const decisions = [1, 2, 3, 4, 5].map((n) => ({
        kind: "primary",
        newChapterId: findChapterId(newDraft.sections, `Chương ${n}`),
        oldChapterId: oldIdByTitle.get(`Chương ${n}`),
      }));
      const baseTreeToken = await computeBaseTreeToken(clientA, storyId);

      // B has no row-level access to A's story, so B's own insert attempt
      // (using B's own owner_id) targeting A's story_id must fail RLS —
      // exercising the same composite-FK/RLS guard rls.import.test.ts
      // already covers for first-time import jobs.
      const { error: crossOwnerInsertError } = await clientB.from("import_jobs").insert({
        owner_id: signInB.user!.id,
        story_id: storyId,
        source_type: "paste",
        parser_version: "test-v1",
        status: "needs_review",
        draft_json: newDraft,
        mapping_json: { version: 1, baseTreeToken, decisions } as unknown as Json,
        warnings: newDraft.warnings,
      });
      expect(crossOwnerInsertError).not.toBeNull();

      // A's own job exists, but B calling the RPC on it must be rejected —
      // the RPC's owner-scoped SELECT ... FOR UPDATE simply won't find it.
      const jobId = await createReimportJob(clientA, ownerAId, storyId, newDraft, {
        version: 1,
        baseTreeToken,
        decisions,
      });
      const byB = await clientB.rpc("commit_reimport_job", { p_job_id: jobId });
      expect(byB.error).not.toBeNull();
      expect(byB.data).toBeNull();
    } finally {
      await clientA.from("stories").delete().eq("id", storyId);
    }
  });
});
