import { describe, expect, it } from "vitest";

import { createTestClient, USER_A_EMAIL, USER_A_PASSWORD, USER_B_EMAIL, USER_B_PASSWORD } from "./env";

// Slice 1's version of the AC-AUTH-01 exit gate, covering the tables added
// for the Reader.
describe("reader domain RLS", () => {
  it("prevents user B from reading user A's sections, chapters or reading_progress", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();

    const { data: signInA, error: signInAError } = await clientA.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInAError).toBeNull();
    const userAId = signInA.user!.id;

    const { data: story, error: storyError } = await clientA
      .from("stories")
      .insert({ title: "RLS reader test story", owner_id: userAId })
      .select("id")
      .single();
    expect(storyError).toBeNull();
    const storyId = story!.id;

    const { data: section, error: sectionError } = await clientA
      .from("sections")
      .insert({ story_id: storyId, type: "arc", title: "Hồi 1", sort_order: 0 })
      .select("id")
      .single();
    expect(sectionError).toBeNull();

    const { data: chapter, error: chapterError } = await clientA
      .from("chapters")
      .insert({
        story_id: storyId,
        section_id: section!.id,
        title: "Chương 1",
        sort_order: 0,
      })
      .select("id")
      .single();
    expect(chapterError).toBeNull();
    const chapterId = chapter!.id;

    const { data: revision, error: revisionError } = await clientA
      .from("chapter_revisions")
      .insert({
        chapter_id: chapterId,
        content_blocks: { schema_version: 1, blocks: [] },
        content_hash: "test-hash",
      })
      .select("id")
      .single();
    expect(revisionError).toBeNull();

    await clientA
      .from("chapters")
      .update({ current_revision_id: revision!.id })
      .eq("id", chapterId);

    await clientA.rpc("upsert_reading_progress", {
      p_story_id: storyId,
      p_chapter_id: chapterId,
      p_chapter_revision_id: revision!.id,
      p_paragraph_anchor_id: "p_test",
      p_paragraph_fingerprint: "test",
      p_paragraph_ordinal: 0,
      p_paragraph_offset_ratio: null,
      p_chapter_progress_pct: 10,
      p_write_id: crypto.randomUUID(),
      p_observed_at: new Date().toISOString(),
    });

    try {
      const { error: signInBError } = await clientB.auth.signInWithPassword({
        email: USER_B_EMAIL,
        password: USER_B_PASSWORD,
      });
      expect(signInBError).toBeNull();

      const { data: sectionsByB } = await clientB
        .from("sections")
        .select("id")
        .eq("story_id", storyId);
      expect(sectionsByB ?? []).toHaveLength(0);

      const { data: chaptersByB } = await clientB
        .from("chapters")
        .select("id")
        .eq("story_id", storyId);
      expect(chaptersByB ?? []).toHaveLength(0);

      const { data: revisionsByB } = await clientB
        .from("chapter_revisions")
        .select("id")
        .eq("chapter_id", chapterId);
      expect(revisionsByB ?? []).toHaveLength(0);

      const { data: progressByB } = await clientB
        .from("reading_progress")
        .select("story_id")
        .eq("story_id", storyId);
      expect(progressByB ?? []).toHaveLength(0);
    } finally {
      await clientA.from("stories").delete().eq("id", storyId);
    }
  });

  it("rejects current_revision_id pointing at another chapter's revision", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerId = signIn.user!.id;

    const { data: story, error: storyError } = await client
      .from("stories")
      .insert({ title: "current_revision_id FK test", owner_id: ownerId })
      .select("id")
      .single();
    expect(storyError).toBeNull();
    const storyId = story!.id;

    try {
      const { data: chapters, error: chaptersError } = await client
        .from("chapters")
        .insert([
          { story_id: storyId, title: "Chương A", sort_order: 0 },
          { story_id: storyId, title: "Chương B", sort_order: 1 },
        ])
        .select("id");
      expect(chaptersError).toBeNull();
      const [chapterA, chapterB] = chapters!;

      const { data: revisionB, error: revisionError } = await client
        .from("chapter_revisions")
        .insert({
          chapter_id: chapterB.id,
          content_blocks: { schema_version: 1, blocks: [] },
          content_hash: "b".repeat(64),
        })
        .select("id")
        .single();
      expect(revisionError).toBeNull();

      // chapterA's current_revision_id must belong to chapterA, not chapterB —
      // the composite FK from migration 0006 must reject this cross-chapter
      // pointer instead of only checking the revision row exists somewhere.
      const { error: crossChapterError } = await client
        .from("chapters")
        .update({ current_revision_id: revisionB!.id })
        .eq("id", chapterA.id);
      expect(crossChapterError).not.toBeNull();
    } finally {
      await client.from("stories").delete().eq("id", storyId);
    }
  });
});
