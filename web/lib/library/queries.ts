import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";
import { logEvent } from "@/lib/telemetry";
import { buildFlatChapterList, type ChapterRow, type SectionRow } from "@/lib/reader/tree";

export type LibraryStory = {
  id: string;
  title: string;
  lastReadAt: string | null;
  chapterCount: number;
  progress: { currentOrdinal: number; totalChapters: number; pct: number } | null;
};

/**
 * One story card needs: chapter count and (if any) how far into the flat
 * chapter list the reader's saved position is. Fetching sections/chapters
 * per-story (like the reader page does via getSectionsAndChapters) would
 * be an N+1 query pattern here since this page lists many stories at
 * once — instead this pulls all of them in two bulk queries and groups by
 * story_id in JS, reusing buildFlatChapterList (pure, no DB access) per
 * story to get chapter ordinals.
 */
export async function getLibraryStories(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  status: "active" | "archived",
): Promise<{ stories: LibraryStory[] | null; error: string | null }> {
  const { data: storyRows, error: storiesError } = await supabase
    .from("stories")
    .select("id, title, last_read_at, updated_at")
    .eq("owner_id", ownerId)
    .eq("status", status)
    .order("last_read_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (storiesError) {
    logEvent("library.stories_query_error", { code: storiesError.code });
    return { stories: null, error: storiesError.code };
  }
  if (!storyRows || storyRows.length === 0) {
    return { stories: [], error: null };
  }

  const storyIds = storyRows.map((story) => story.id);

  const [{ data: sectionRows, error: sectionsError }, { data: chapterRows, error: chaptersError }] =
    await Promise.all([
      supabase
        .from("sections")
        .select("id, story_id, parent_section_id, title, sort_order")
        .in("story_id", storyIds)
        .eq("is_active", true),
      supabase
        .from("chapters")
        .select("id, story_id, section_id, title, sort_order")
        .in("story_id", storyIds)
        .eq("is_active", true),
    ]);
  if (sectionsError) logEvent("library.sections_query_error", { code: sectionsError.code });
  if (chaptersError) logEvent("library.chapters_query_error", { code: chaptersError.code });

  const { data: progressRows, error: progressError } = await supabase
    .from("reading_progress")
    .select("story_id, chapter_id")
    .eq("user_id", ownerId)
    .in("story_id", storyIds);
  if (progressError) logEvent("library.progress_query_error", { code: progressError.code });

  const sectionsByStory = new Map<string, SectionRow[]>();
  for (const row of sectionRows ?? []) {
    const list = sectionsByStory.get(row.story_id) ?? [];
    list.push(row);
    sectionsByStory.set(row.story_id, list);
  }
  const chaptersByStory = new Map<string, ChapterRow[]>();
  for (const row of chapterRows ?? []) {
    const list = chaptersByStory.get(row.story_id) ?? [];
    list.push(row);
    chaptersByStory.set(row.story_id, list);
  }
  const progressChapterByStory = new Map<string, string>();
  for (const row of progressRows ?? []) {
    progressChapterByStory.set(row.story_id, row.chapter_id);
  }

  const stories: LibraryStory[] = storyRows.map((story) => {
    const flat = buildFlatChapterList(sectionsByStory.get(story.id) ?? [], chaptersByStory.get(story.id) ?? []);
    const progressChapterId = progressChapterByStory.get(story.id);
    const ordinal = progressChapterId
      ? flat.findIndex((entry) => entry.chapterId === progressChapterId)
      : -1;

    return {
      id: story.id,
      title: story.title,
      lastReadAt: story.last_read_at,
      chapterCount: flat.length,
      progress:
        ordinal >= 0 && flat.length > 0
          ? {
              currentOrdinal: ordinal + 1,
              totalChapters: flat.length,
              pct: Math.round(((ordinal + 1) / flat.length) * 100),
            }
          : null,
    };
  });

  return { stories, error: null };
}
