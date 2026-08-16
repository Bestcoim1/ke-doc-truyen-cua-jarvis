import { describe, expect, it } from "vitest";

import { normalizeAliases, parseLineRange } from "@/lib/studio/validation";

describe("Continuity Studio validation", () => {
  it("normalizes aliases without case-insensitive duplicates", () => {
    expect(normalizeAliases("Eve, EVE\n Eva ; Người Gác Cổng")).toEqual([
      "Eve",
      "Eva",
      "Người Gác Cổng",
    ]);
  });

  it("accepts an omitted or increasing evidence line range", () => {
    expect(parseLineRange(null, null)).toEqual({
      ok: true,
      startLine: null,
      endLine: null,
    });
    expect(parseLineRange("12", "18")).toEqual({
      ok: true,
      startLine: 12,
      endLine: 18,
    });
    expect(parseLineRange("12", "")).toEqual({
      ok: true,
      startLine: 12,
      endLine: 12,
    });
  });

  it("rejects partial, reversed, or non-positive line ranges", () => {
    expect(parseLineRange("", "8")).toEqual({ ok: false });
    expect(parseLineRange("9", "8")).toEqual({ ok: false });
    expect(parseLineRange("0", "1")).toEqual({ ok: false });
  });
});

