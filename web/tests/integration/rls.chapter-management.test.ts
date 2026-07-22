import { describe, expect, it } from "vitest";

import {
  createTestClient,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B_EMAIL,
  USER_B_PASSWORD,
} from "./env";

describe("chapter and section management", () => {
  it("only lets the story owner rename or delete chapters and preserves section contents", async () => {
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

    const { data: story, error: storyError } = await clientA
      .from("stories")
      .insert({
        owner_id: signInA.user!.id,
        title: "Chapter management RLS test",
      })
      .select("id")
      .single();
    expect(storyError).toBeNull();
    const storyId = story!.id;

    try {
      const { data: rootSections, error: rootSectionsError } = await clientA
        .from("sections")
        .insert([
          {
            story_id: storyId,
            type: "arc",
            title: "Hồi cần xoá",
            sort_order: 0,
          },
          {
            story_id: storyId,
            type: "part",
            title: "Chưa phân hồi",
            sort_order: 1,
          },
        ])
        .select("id, title");
      expect(rootSectionsError).toBeNull();

      const targetSectionId = rootSections!.find(
        (section) => section.title === "Hồi cần xoá",
      )!.id;
      const fallbackSectionId = rootSections!.find(
        (section) => section.title === "Chưa phân hồi",
      )!.id;

      const { data: childSection, error: childSectionError } = await clientA
        .from("sections")
        .insert({
          story_id: storyId,
          parent_section_id: targetSectionId,
          type: "part",
          title: "Arc con",
          sort_order: 0,
        })
        .select("id")
        .single();
      expect(childSectionError).toBeNull();

      const { data: chapters, error: chaptersError } = await clientA
        .from("chapters")
        .insert([
          {
            story_id: storyId,
            section_id: fallbackSectionId,
            title: "Chương đã có trong nhóm dự phòng",
            sort_order: 0,
          },
          {
            story_id: storyId,
            section_id: targetSectionId,
            title: "Ngoại truyện cần giữ",
            sort_order: 0,
          },
          {
            story_id: storyId,
            section_id: childSection!.id,
            title: "Chương trong Arc con",
            sort_order: 0,
          },
        ])
        .select("id, title");
      expect(chaptersError).toBeNull();

      const chapterToDelete = chapters!.find(
        (chapter) => chapter.title === "Ngoại truyện cần giữ",
      )!;
      const { data: revision, error: revisionError } = await clientA
        .from("chapter_revisions")
        .insert({
          chapter_id: chapterToDelete.id,
          content_blocks: { schema_version: 1, blocks: [] },
          content_hash: "d".repeat(64),
        })
        .select("id")
        .single();
      expect(revisionError).toBeNull();

      const { error: setCurrentRevisionError } = await clientA
        .from("chapters")
        .update({ current_revision_id: revision!.id })
        .eq("id", chapterToDelete.id);
      expect(setCurrentRevisionError).toBeNull();

      const { data: renamedByB, error: renamedByBError } = await clientB
        .from("chapters")
        .update({ title: "Tên không được phép" })
        .eq("id", chapterToDelete.id)
        .select("id, title");
      expect(renamedByBError).toBeNull();
      expect(renamedByB).toHaveLength(0);

      const renamedTitle = "Ngoại truyện đã đổi tên";
      const { data: renamedByA, error: renamedByAError } = await clientA
        .from("chapters")
        .update({ title: renamedTitle })
        .eq("id", chapterToDelete.id)
        .select("id, title")
        .single();
      expect(renamedByAError).toBeNull();
      expect(renamedByA).toMatchObject({
        id: chapterToDelete.id,
        title: renamedTitle,
      });

      const { error: sectionDeleteByBError } = await clientB.rpc(
        "delete_story_section_preserving_contents",
        {
          p_story_id: storyId,
          p_section_id: targetSectionId,
        },
      );
      expect(sectionDeleteByBError?.code).toBe("P0002");

      const { data: sectionDeleteResult, error: sectionDeleteError } =
        await clientA.rpc("delete_story_section_preserving_contents", {
          p_story_id: storyId,
          p_section_id: targetSectionId,
        });
      expect(sectionDeleteError).toBeNull();
      expect(sectionDeleteResult).toMatchObject({
        movedChapterCount: 1,
        promotedSectionCount: 1,
        destinationSectionId: fallbackSectionId,
      });

      const { data: deletedSection } = await clientA
        .from("sections")
        .select("id")
        .eq("id", targetSectionId)
        .maybeSingle();
      expect(deletedSection).toBeNull();

      const { data: promotedChild, error: promotedChildError } = await clientA
        .from("sections")
        .select("parent_section_id")
        .eq("id", childSection!.id)
        .single();
      expect(promotedChildError).toBeNull();
      expect(promotedChild?.parent_section_id).toBeNull();

      const { data: movedChapter, error: movedChapterError } = await clientA
        .from("chapters")
        .select("section_id, sort_order")
        .eq("id", chapterToDelete.id)
        .single();
      expect(movedChapterError).toBeNull();
      expect(movedChapter?.section_id).toBe(fallbackSectionId);
      expect(movedChapter?.sort_order).toBe(1);

      const { data: deletedByB, error: deletedByBError } = await clientB
        .from("chapters")
        .delete()
        .eq("id", chapterToDelete.id)
        .select("id");
      expect(deletedByBError).toBeNull();
      expect(deletedByB).toHaveLength(0);

      const { data: deletedByA, error: deletedByAError } = await clientA
        .from("chapters")
        .delete()
        .eq("id", chapterToDelete.id)
        .select("id")
        .single();
      expect(deletedByAError).toBeNull();
      expect(deletedByA?.id).toBe(chapterToDelete.id);

      const { data: revisionAfterDelete } = await clientA
        .from("chapter_revisions")
        .select("id")
        .eq("id", revision!.id)
        .maybeSingle();
      expect(revisionAfterDelete).toBeNull();
    } finally {
      await clientA.from("stories").delete().eq("id", storyId);
    }
  });

  it("creates a manageable fallback section when deleting a root section", async () => {
    const client = createTestClient();
    const { data: signIn, error: signInError } =
      await client.auth.signInWithPassword({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
      });
    expect(signInError).toBeNull();

    const { data: story, error: storyError } = await client
      .from("stories")
      .insert({
        owner_id: signIn.user!.id,
        title: "Section fallback creation test",
      })
      .select("id")
      .single();
    expect(storyError).toBeNull();
    const storyId = story!.id;

    try {
      const { data: section, error: sectionError } = await client
        .from("sections")
        .insert({
          story_id: storyId,
          type: "arc",
          title: "Hồi 2",
          sort_order: 0,
        })
        .select("id")
        .single();
      expect(sectionError).toBeNull();

      const { data: chapter, error: chapterError } = await client
        .from("chapters")
        .insert({
          story_id: storyId,
          section_id: section!.id,
          title: "Ngoại truyện 200",
          sort_order: 0,
        })
        .select("id")
        .single();
      expect(chapterError).toBeNull();

      const { data: result, error: deleteError } = await client.rpc(
        "delete_story_section_preserving_contents",
        {
          p_story_id: storyId,
          p_section_id: section!.id,
        },
      );
      expect(deleteError).toBeNull();
      expect(result).toMatchObject({ movedChapterCount: 1 });

      const { data: fallback, error: fallbackError } = await client
        .from("sections")
        .select("id, title, parent_section_id")
        .eq("story_id", storyId)
        .single();
      expect(fallbackError).toBeNull();
      expect(fallback?.title).toBe("Chưa phân hồi");
      expect(fallback?.parent_section_id).toBeNull();

      const { data: movedChapter, error: movedChapterError } = await client
        .from("chapters")
        .select("section_id")
        .eq("id", chapter!.id)
        .single();
      expect(movedChapterError).toBeNull();
      expect(movedChapter?.section_id).toBe(fallback?.id);
    } finally {
      await client.from("stories").delete().eq("id", storyId);
    }
  });
});
