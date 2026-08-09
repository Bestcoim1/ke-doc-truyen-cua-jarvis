import { describe, expect, it } from "vitest";

import { MIN_PASSWORD_LENGTH, passwordLengthError } from "@/lib/auth/password-policy";

describe("password policy", () => {
  it("accepts passwords at the shared minimum", () => {
    expect(passwordLengthError("x".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects shorter passwords", () => {
    expect(passwordLengthError("x".repeat(MIN_PASSWORD_LENGTH - 1))).toContain(
      String(MIN_PASSWORD_LENGTH),
    );
  });
});
