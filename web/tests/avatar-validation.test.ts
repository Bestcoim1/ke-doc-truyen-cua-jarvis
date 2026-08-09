import { describe, expect, it } from "vitest";

import {
  avatarPathFromPublicUrl,
  detectAvatarFormat,
  validateAvatarUpload,
} from "@/lib/settings/avatar-validation";

describe("avatar validation", () => {
  it.each([
    [new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg", "jpg"],
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png", "png"],
    [new TextEncoder().encode("GIF89a"), "image/gif", "gif"],
    [new TextEncoder().encode("RIFF0000WEBP"), "image/webp", "webp"],
    [new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypavif")]), "image/avif", "avif"],
  ])("detects trusted bytes as %s", (bytes, contentType, extension) => {
    expect(detectAvatarFormat(bytes)).toEqual({ contentType, extension });
  });

  it("rejects an executable renamed as an image", () => {
    expect(validateAvatarUpload(new TextEncoder().encode("MZpayload"), "image/png")).toBeNull();
  });

  it("rejects a declared MIME type that disagrees with the bytes", () => {
    expect(validateAvatarUpload(new Uint8Array([0xff, 0xd8, 0xff]), "image/png")).toBeNull();
  });

  it("only extracts avatar objects owned by the current user", () => {
    const ownUrl =
      "https://example.supabase.co/storage/v1/object/public/media/user-a/avatars/avatar.jpg";
    expect(avatarPathFromPublicUrl(ownUrl, "user-a")).toBe("user-a/avatars/avatar.jpg");
    expect(avatarPathFromPublicUrl(ownUrl, "user-b")).toBeNull();
    expect(avatarPathFromPublicUrl("https://example.com/avatar.jpg", "user-a")).toBeNull();
  });
});
