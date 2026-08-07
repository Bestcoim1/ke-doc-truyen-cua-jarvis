import { describe, expect, it } from "vitest";

import {
  normalizeStoryTitle,
  STORY_TITLE_MAX_LENGTH,
} from "@/lib/library/story-title";

describe("normalizeStoryTitle", () => {
  it("trims a valid Unicode title", () => {
    expect(normalizeStoryTitle("  Ngoại truyện: Đêm đầy sao  ")).toBe(
      "Ngoại truyện: Đêm đầy sao",
    );
  });

  it("rejects empty and non-string values", () => {
    expect(normalizeStoryTitle("   ")).toBeNull();
    expect(normalizeStoryTitle(null)).toBeNull();
  });

  it("accepts the database limit and rejects longer titles", () => {
    expect(normalizeStoryTitle("a".repeat(STORY_TITLE_MAX_LENGTH))).toHaveLength(
      STORY_TITLE_MAX_LENGTH,
    );
    expect(
      normalizeStoryTitle("a".repeat(STORY_TITLE_MAX_LENGTH + 1)),
    ).toBeNull();
  });
});
