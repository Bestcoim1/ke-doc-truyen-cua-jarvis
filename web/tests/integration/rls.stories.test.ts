import { describe, expect, it } from "vitest";

import {
  createTestClient,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B_EMAIL,
  USER_B_PASSWORD,
} from "./env";

// Automated form of the Slice 0 exit gate: "User A không thể đọc dữ liệu
// User B".
describe("stories RLS", () => {
  it("prevents user B from reading, updating or deleting user A's story", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();

    const { data: signInA, error: signInAError } =
      await clientA.auth.signInWithPassword({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
      });
    expect(signInAError).toBeNull();

    const { data: inserted, error: insertError } = await clientA
      .from("stories")
      .insert({ title: "RLS test story", owner_id: signInA.user!.id })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    const storyId = inserted!.id;

    try {
      const { error: signInBError } = await clientB.auth.signInWithPassword({
        email: USER_B_EMAIL,
        password: USER_B_PASSWORD,
      });
      expect(signInBError).toBeNull();

      const { data: readByB } = await clientB
        .from("stories")
        .select("id")
        .eq("id", storyId)
        .maybeSingle();
      expect(readByB).toBeNull();

      const { data: updatedByB } = await clientB
        .from("stories")
        .update({ title: "hijacked" })
        .eq("id", storyId)
        .select("id");
      expect(updatedByB ?? []).toHaveLength(0);

      const { data: deletedByB } = await clientB
        .from("stories")
        .delete()
        .eq("id", storyId)
        .select("id");
      expect(deletedByB ?? []).toHaveLength(0);
    } finally {
      await clientA.from("stories").delete().eq("id", storyId);
    }
  });
});
