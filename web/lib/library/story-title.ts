export const STORY_TITLE_MAX_LENGTH = 200;

export function normalizeStoryTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const title = value.trim();
  if (title.length === 0 || title.length > STORY_TITLE_MAX_LENGTH) return null;

  return title;
}
