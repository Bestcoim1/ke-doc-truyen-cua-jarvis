import { describe, expect, it } from "vitest";

import type { DraftChapter, DraftSection } from "../../lib/import/text-parser";
import { parseStoryText } from "../../lib/import/text-parser";
import {
  createTestClient,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B_EMAIL,
  USER_B_PASSWORD,
} from "./env";

function firstChapter(sections: DraftSection[]): DraftChapter | undefined {
  for (const section of sections) {
    if (section.chapters[0]) return section.chapters[0];
    const nested = firstChapter(section.children);
    if (nested) return nested;
  }
  return undefined;
}

function twoChapterDraft(title: string) {
  return parseStoryText(
    `Hồi 1
Chương 1
Nội dung chương đầu tiên.

Chương 2
Nội dung chương thứ hai.`,
    { title, sourceType: "paste" },
  );
}

describe("import domain constraints and RLS", () => {
  it("keeps jobs and versions owner-scoped and enforces import invariants", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();

    const { data: signInA, error: signInAError } =
      await clientA.auth.signInWithPassword({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
      });
    expect(signInAError).toBeNull();

    const { data: signInB, error: signInBError } =
      await clientB.auth.signInWithPassword({
        email: USER_B_EMAIL,
        password: USER_B_PASSWORD,
      });
    expect(signInBError).toBeNull();

    const userAId = signInA.user!.id;
    const userBId = signInB.user!.id;
    const storyIds: string[] = [];
    const jobIds: string[] = [];
    let versionId: string | undefined;

    try {
      for (const title of ["Import RLS story A", "Import RLS story A2"]) {
        const { data, error } = await clientA
          .from("stories")
          .insert({ owner_id: userAId, title })
          .select("id")
          .single();
        expect(error).toBeNull();
        storyIds.push(data!.id);
      }

      const { error: missingDraftError } = await clientA
        .from("import_jobs")
        .insert({
          owner_id: userAId,
          story_id: storyIds[0],
          source_type: "paste",
          parser_version: "test-v1",
          status: "needs_review",
        });
      expect(missingDraftError).not.toBeNull();

      for (const storyId of [storyIds[0], storyIds[1], storyIds[0]]) {
        const { data, error } = await clientA
          .from("import_jobs")
          .insert({
            owner_id: userAId,
            story_id: storyId,
            source_type: "paste",
            parser_version: "test-v1",
            status: "needs_review",
            draft_json: { sections: [] },
          })
          .select("id")
          .single();
        expect(error).toBeNull();
        jobIds.push(data!.id);
      }

      const { data: version, error: versionError } = await clientA
        .from("story_versions")
        .insert({
          story_id: storyIds[0],
          import_job_id: jobIds[0],
          version_number: 1,
          parser_version: "test-v1",
        })
        .select("id")
        .single();
      expect(versionError).toBeNull();
      versionId = version!.id;

      const { error: crossStoryError } = await clientA
        .from("story_versions")
        .insert({
          story_id: storyIds[0],
          import_job_id: jobIds[1],
          version_number: 2,
          parser_version: "test-v1",
        });
      expect(crossStoryError).not.toBeNull();

      const { error: duplicateVersionError } = await clientA
        .from("story_versions")
        .insert({
          story_id: storyIds[0],
          import_job_id: jobIds[2],
          version_number: 1,
          parser_version: "test-v1",
        });
      expect(duplicateVersionError).not.toBeNull();

      const { data: jobsByB } = await clientB
        .from("import_jobs")
        .select("id")
        .eq("id", jobIds[0]);
      expect(jobsByB ?? []).toHaveLength(0);

      const { data: versionsByB } = await clientB
        .from("story_versions")
        .select("id")
        .eq("id", versionId);
      expect(versionsByB ?? []).toHaveLength(0);

      const { data: updatedJobsByB } = await clientB
        .from("import_jobs")
        .update({ status: "cancelled" })
        .eq("id", jobIds[0])
        .select("id");
      expect(updatedJobsByB ?? []).toHaveLength(0);

      const { data: deletedVersionsByB } = await clientB
        .from("story_versions")
        .delete()
        .eq("id", versionId)
        .select("id");
      expect(deletedVersionsByB ?? []).toHaveLength(0);

      const { error: foreignStoryJobError } = await clientB
        .from("import_jobs")
        .insert({
          owner_id: userBId,
          story_id: storyIds[0],
          source_type: "paste",
          parser_version: "test-v1",
          status: "uploaded",
        });
      expect(foreignStoryJobError).not.toBeNull();
    } finally {
      if (versionId) {
        await clientA.from("story_versions").delete().eq("id", versionId);
      }
      if (jobIds.length > 0) {
        await clientA.from("import_jobs").delete().in("id", jobIds);
      }
      if (storyIds.length > 0) {
        await clientA.from("stories").delete().in("id", storyIds);
      }
    }
  });

  it("commits a reviewed draft atomically and idempotently", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } =
      await client.auth.signInWithPassword({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
      });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;
    const draft = twoChapterDraft("RPC import test");

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
    const jobId = job!.id;
    let storyId: string | undefined;

    try {
      const first = await client.rpc("commit_import_job", { p_job_id: jobId });
      expect(first.error).toBeNull();
      const firstResult = first.data?.[0];
      storyId = firstResult?.story_id;
      expect(storyId).toBeTruthy();

      const retry = await client.rpc("commit_import_job", { p_job_id: jobId });
      expect(retry.error).toBeNull();
      expect(retry.data?.[0]).toMatchObject(firstResult!);

      const [{ data: versions }, { data: sections }, { data: chapters }] =
        await Promise.all([
          client.from("story_versions").select("id").eq("story_id", storyId!),
          client.from("sections").select("id").eq("story_id", storyId!),
          client
            .from("chapters")
            .select("id, current_revision_id")
            .eq("story_id", storyId!),
        ]);
      expect(versions).toHaveLength(1);
      expect(sections).toHaveLength(1);
      expect(chapters).toHaveLength(2);
      expect(chapters?.every((chapter) => chapter.current_revision_id)).toBe(
        true,
      );

      const { data: completedJob } = await client
        .from("import_jobs")
        .select("status, story_id, completed_at")
        .eq("id", jobId)
        .single();
      expect(completedJob).toMatchObject({
        status: "completed",
        story_id: storyId,
      });
      expect(completedJob?.completed_at).toBeTruthy();
    } finally {
      if (storyId) await client.from("stories").delete().eq("id", storyId);
      await client.from("import_jobs").delete().eq("id", jobId);
    }
  });

  it("rejects a commit RPC call from a user who does not own the job", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();

    const { data: signInA, error: signInAError } =
      await clientA.auth.signInWithPassword({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
      });
    expect(signInAError).toBeNull();
    const { error: signInBError } = await clientB.auth.signInWithPassword({
      email: USER_B_EMAIL,
      password: USER_B_PASSWORD,
    });
    expect(signInBError).toBeNull();

    const draft = twoChapterDraft("Non-owner commit attempt");
    const { data: job, error: jobError } = await clientA
      .from("import_jobs")
      .insert({
        owner_id: signInA.user!.id,
        source_type: "paste",
        parser_version: "test-v1",
        status: "needs_review",
        draft_json: draft,
        warnings: draft.warnings,
      })
      .select("id")
      .single();
    expect(jobError).toBeNull();
    const jobId = job!.id;

    try {
      const byB = await clientB.rpc("commit_import_job", { p_job_id: jobId });
      expect(byB.error).not.toBeNull();
      expect(byB.data).toBeNull();

      // Still uncommitted and still owned by A — B's attempt had no effect.
      const { data: job2 } = await clientA
        .from("import_jobs")
        .select("status, story_id")
        .eq("id", jobId)
        .single();
      expect(job2).toMatchObject({ status: "needs_review", story_id: null });
    } finally {
      await clientA.from("import_jobs").delete().eq("id", jobId);
    }
  });

  it("rolls back and leaves the job resumable when the draft has no chapters", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } =
      await client.auth.signInWithPassword({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
      });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;
    const title = "Empty draft rollback test";

    const { data: job, error: jobError } = await client
      .from("import_jobs")
      .insert({
        owner_id: ownerId,
        source_type: "paste",
        parser_version: "test-v1",
        status: "needs_review",
        draft_json: { title, sections: [] },
        warnings: [],
      })
      .select("id")
      .single();
    expect(jobError).toBeNull();
    const jobId = job!.id;

    try {
      const result = await client.rpc("commit_import_job", { p_job_id: jobId });
      expect(result.error).not.toBeNull();
      expect(result.error?.message).toMatch(/no chapters/i);

      const { data: jobAfter } = await client
        .from("import_jobs")
        .select("status, story_id, completed_at")
        .eq("id", jobId)
        .single();
      expect(jobAfter).toMatchObject({
        status: "needs_review",
        story_id: null,
        completed_at: null,
      });

      const { data: leakedStories } = await client
        .from("stories")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("title", title);
      expect(leakedStories ?? []).toHaveLength(0);
    } finally {
      await client.from("import_jobs").delete().eq("id", jobId);
    }
  });

  it("rolls back when a chapter's content hash is malformed", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } =
      await client.auth.signInWithPassword({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
      });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;
    const title = "Malformed hash rollback test";
    const draft = twoChapterDraft(title);
    const chapter = firstChapter(draft.sections);
    expect(chapter).toBeDefined();
    chapter!.contentHash = "not-a-valid-hash";

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
    const jobId = job!.id;

    try {
      const result = await client.rpc("commit_import_job", { p_job_id: jobId });
      expect(result.error).not.toBeNull();
      expect(result.error?.message).toMatch(/invalid chapter/i);

      const { data: jobAfter } = await client
        .from("import_jobs")
        .select("status, story_id")
        .eq("id", jobId)
        .single();
      expect(jobAfter).toMatchObject({
        status: "needs_review",
        story_id: null,
      });

      const { data: leakedStories } = await client
        .from("stories")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("title", title);
      expect(leakedStories ?? []).toHaveLength(0);
    } finally {
      await client.from("import_jobs").delete().eq("id", jobId);
    }
  });

  it("commits idempotently when the same job is committed concurrently", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } =
      await client.auth.signInWithPassword({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
      });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;
    const title = "Concurrent commit test";
    const draft = twoChapterDraft(title);

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
    const jobId = job!.id;
    let storyId: string | undefined;

    try {
      const [first, second] = await Promise.all([
        client.rpc("commit_import_job", { p_job_id: jobId }),
        client.rpc("commit_import_job", { p_job_id: jobId }),
      ]);
      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      const firstResult = first.data?.[0];
      const secondResult = second.data?.[0];
      expect(firstResult).toBeTruthy();
      expect(secondResult).toEqual(firstResult);
      storyId = firstResult?.story_id;

      const { data: stories } = await client
        .from("stories")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("title", title);
      expect(stories).toHaveLength(1);

      const { data: versions } = await client
        .from("story_versions")
        .select("id")
        .eq("story_id", storyId!);
      expect(versions).toHaveLength(1);
    } finally {
      if (storyId) await client.from("stories").delete().eq("id", storyId);
      await client.from("import_jobs").delete().eq("id", jobId);
    }
  });
});
