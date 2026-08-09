import { describe, expect, it } from "vitest";

import {
  createTestClient,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B_EMAIL,
  USER_B_PASSWORD,
} from "./env";

describe("Storage bucket hardening", () => {
  it("keeps public avatar downloads while restricting metadata and writes to the owner", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();
    const anonymous = createTestClient();
    const [{ data: authA }, { data: authB }] = await Promise.all([
      clientA.auth.signInWithPassword({ email: USER_A_EMAIL, password: USER_A_PASSWORD }),
      clientB.auth.signInWithPassword({ email: USER_B_EMAIL, password: USER_B_PASSWORD }),
    ]);
    const path = `${authA.user!.id}/avatars/${crypto.randomUUID()}.png`;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const { error: uploadError } = await clientA.storage.from("media").upload(path, png, {
      contentType: "image/png",
      upsert: false,
    });
    expect(uploadError).toBeNull();

    try {
      const publicUrl = clientA.storage.from("media").getPublicUrl(path).data.publicUrl;
      const response = await fetch(publicUrl);
      expect(response.ok).toBe(true);

      const { data: ownerList, error: ownerListError } = await clientA.storage
        .from("media")
        .list(`${authA.user!.id}/avatars`);
      expect(ownerListError).toBeNull();
      expect(ownerList?.some((object) => path.endsWith(object.name))).toBe(true);

      const { data: anonymousList } = await anonymous.storage
        .from("media")
        .list(`${authA.user!.id}/avatars`);
      expect(anonymousList ?? []).toHaveLength(0);

      const { data: otherUserList } = await clientB.storage
        .from("media")
        .list(`${authA.user!.id}/avatars`);
      expect(otherUserList ?? []).toHaveLength(0);

      const { error: overwriteError } = await clientB.storage.from("media").upload(path, png, {
        contentType: "image/png",
        upsert: true,
      });
      expect(overwriteError).not.toBeNull();

      const { error: wrongMimeError } = await clientA.storage
        .from("media")
        .upload(`${authA.user!.id}/avatars/${crypto.randomUUID()}.svg`, "<svg />", {
          contentType: "image/svg+xml",
        });
      expect(wrongMimeError).not.toBeNull();
      expect(authB.user!.id).not.toBe(authA.user!.id);
    } finally {
      await clientA.storage.from("media").remove([path]);
    }
  });

  it("keeps import sources private and owner-only", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();
    const [{ data: authA }, { data: authB }] = await Promise.all([
      clientA.auth.signInWithPassword({ email: USER_A_EMAIL, password: USER_A_PASSWORD }),
      clientB.auth.signInWithPassword({ email: USER_B_EMAIL, password: USER_B_PASSWORD }),
    ]);
    const path = `${authA.user!.id}/tests/${crypto.randomUUID()}.txt`;
    const { error: uploadError } = await clientA.storage
      .from("story-sources")
      .upload(path, "private source", { contentType: "text/plain" });
    expect(uploadError).toBeNull();

    try {
      const { data: otherUserList } = await clientB.storage
        .from("story-sources")
        .list(`${authA.user!.id}/tests`);
      expect(otherUserList ?? []).toHaveLength(0);

      const { data: removeByB } = await clientB.storage.from("story-sources").remove([path]);
      expect(removeByB ?? []).toHaveLength(0);

      const { data: ownerDownload, error: ownerDownloadError } = await clientA.storage
        .from("story-sources")
        .download(path);
      expect(ownerDownloadError).toBeNull();
      expect(await ownerDownload?.text()).toBe("private source");
      expect(authB.user!.id).not.toBe(authA.user!.id);
    } finally {
      await clientA.storage.from("story-sources").remove([path]);
    }
  });
});
