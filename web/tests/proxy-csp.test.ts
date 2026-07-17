import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "@/proxy";

describe("buildContentSecurityPolicy", () => {
  it("allows the configured Supabase origin for images and API calls", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "test-nonce",
      isProd: true,
      imageOrigin: "https://project.supabase.co",
    });

    expect(policy).toContain(
      "img-src 'self' blob: data: https://project.supabase.co",
    );
    expect(policy).toContain(
      "connect-src 'self' https://project.supabase.co",
    );
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("does not broaden image sources when Supabase is not configured", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "test-nonce",
      isProd: false,
      imageOrigin: "",
    });

    expect(policy).toContain("img-src 'self' blob: data:");
    expect(policy).toContain("ws://localhost:* http://localhost:*");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});
