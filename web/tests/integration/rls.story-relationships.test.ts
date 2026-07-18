import { describe, expect, it } from "vitest";

import {
  createTestClient,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B_EMAIL,
  USER_B_PASSWORD,
} from "./env";

describe("story_relationships RLS and constraints", () => {
  it("enforces ownership, unordered uniqueness, archive and cascade semantics", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();
    const anonClient = createTestClient();

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

    const { data: storiesA, error: storiesAError } = await clientA
      .from("stories")
      .insert([
        { owner_id: signInA.user!.id, title: "Graph RLS A1" },
        { owner_id: signInA.user!.id, title: "Graph RLS A2" },
      ])
      .select("id")
      .order("id");
    expect(storiesAError).toBeNull();
    expect(storiesA).toHaveLength(2);

    const { data: storyB, error: storyBError } = await clientB
      .from("stories")
      .insert({ owner_id: signInB.user!.id, title: "Graph RLS B1" })
      .select("id")
      .single();
    expect(storyBError).toBeNull();

    const [storyA1, storyA2] = storiesA!;
    let relationshipId: string | null = null;

    try {
      const { data: relationship, error: relationshipError } = await clientA
        .from("story_relationships")
        .insert({
          relationship_type: "sequel",
          source_story_id: storyA1.id,
          target_story_id: storyA2.id,
        })
        .select("id")
        .single();
      expect(relationshipError).toBeNull();
      relationshipId = relationship!.id;

      const { data: rowsAfterInsert, error: rowsAfterInsertError } = await clientA
        .from("story_relationships")
        .select("id, source_story_id, target_story_id")
        .or(
          `and(source_story_id.eq.${storyA1.id},target_story_id.eq.${storyA2.id}),and(source_story_id.eq.${storyA2.id},target_story_id.eq.${storyA1.id})`,
        );
      expect(rowsAfterInsertError).toBeNull();
      expect(rowsAfterInsert).toHaveLength(1);

      const { error: selfLinkError } = await clientA
        .from("story_relationships")
        .insert({
          relationship_type: "related",
          source_story_id: storyA1.id,
          target_story_id: storyA1.id,
        });
      expect(selfLinkError?.code).toBe("23514");

      const { error: inverseError } = await clientA
        .from("story_relationships")
        .insert({
          relationship_type: "spinoff",
          source_story_id: storyA2.id,
          target_story_id: storyA1.id,
        });
      expect(inverseError?.code).toBe("23505");

      const { error: secondTypeError } = await clientA
        .from("story_relationships")
        .insert({
          relationship_type: "adaptation",
          source_story_id: storyA1.id,
          target_story_id: storyA2.id,
        });
      expect(secondTypeError?.code).toBe("23505");

      const { error: crossOwnerInsertError } = await clientA
        .from("story_relationships")
        .insert({
          relationship_type: "related",
          source_story_id: storyA1.id,
          target_story_id: storyB!.id,
        });
      expect(crossOwnerInsertError?.code).toBe("42501");

      const { data: readByB, error: readByBError } = await clientB
        .from("story_relationships")
        .select("id")
        .eq("id", relationshipId);
      expect(readByBError).toBeNull();
      expect(readByB).toHaveLength(0);

      const { data: updatedByB, error: updatedByBError } = await clientB
        .from("story_relationships")
        .update({ relationship_type: "adaptation" })
        .eq("id", relationshipId)
        .select("id");
      expect(updatedByBError).toBeNull();
      expect(updatedByB).toHaveLength(0);

      const { data: deletedByB, error: deletedByBError } = await clientB
        .from("story_relationships")
        .delete()
        .eq("id", relationshipId)
        .select("id");
      expect(deletedByBError).toBeNull();
      expect(deletedByB).toHaveLength(0);

      const { data: updatedByA, error: updatedByAError } = await clientA
        .from("story_relationships")
        .update({ relationship_type: "adaptation" })
        .eq("id", relationshipId)
        .select("relationship_type")
        .single();
      expect(updatedByAError).toBeNull();
      expect(updatedByA?.relationship_type).toBe("adaptation");

      const { error: crossOwnerUpdateError } = await clientA
        .from("story_relationships")
        .update({ target_story_id: storyB!.id })
        .eq("id", relationshipId);
      expect(crossOwnerUpdateError?.code).toBe("42501");

      const { error: archiveError } = await clientA
        .from("stories")
        .update({ status: "archived" })
        .eq("id", storyA2.id);
      expect(archiveError).toBeNull();

      const { data: relationshipWhileArchived } = await clientA
        .from("story_relationships")
        .select("id")
        .eq("id", relationshipId)
        .single();
      expect(relationshipWhileArchived?.id).toBe(relationshipId);

      const { error: restoreError } = await clientA
        .from("stories")
        .update({ status: "active" })
        .eq("id", storyA2.id);
      expect(restoreError).toBeNull();

      const { error: anonError } = await anonClient
        .from("story_relationships")
        .select("id")
        .limit(1);
      expect(anonError?.code).toBe("42501");

      const { error: deleteStoryError } = await clientA
        .from("stories")
        .delete()
        .eq("id", storyA2.id);
      expect(deleteStoryError).toBeNull();

      const { data: relationshipAfterCascade } = await clientA
        .from("story_relationships")
        .select("id")
        .eq("id", relationshipId)
        .maybeSingle();
      expect(relationshipAfterCascade).toBeNull();

      const { data: remainingStory } = await clientA
        .from("stories")
        .select("id")
        .eq("id", storyA1.id)
        .single();
      expect(remainingStory?.id).toBe(storyA1.id);
    } finally {
      await clientA
        .from("stories")
        .delete()
        .in("id", [storyA1.id, storyA2.id]);
      await clientB.from("stories").delete().eq("id", storyB!.id);
    }
  });
});
