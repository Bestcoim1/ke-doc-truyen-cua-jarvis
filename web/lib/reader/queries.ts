import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";
import type { Block, ChapterRevisionContent, ReadingSettings } from "./types";

export { buildFlatChapterList, buildTocTree } from "./tree";
export type { ChapterRow, SectionRow, TocNode } from "./tree";

export async function getStoryForReader(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  storyId: string,
) {
  const { data } = await supabase
    .from("stories")
    .select("id, title")
    .eq("id", storyId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  return data;
}

export async function getSectionsAndChapters(supabase: SupabaseClient<Database>, storyId: string) {
  const [{ data: sections }, { data: chapters }] = await Promise.all([
    supabase
      .from("sections")
      .select("id, parent_section_id, title, sort_order")
      .eq("story_id", storyId)
      .eq("is_active", true),
    supabase
      .from("chapters")
      .select("id, section_id, title, sort_order, current_revision_id")
      .eq("story_id", storyId)
      .eq("is_active", true),
  ]);
  return { sections: sections ?? [], chapters: chapters ?? [] };
}

export async function getChapterRevisionContent(
  supabase: SupabaseClient<Database>,
  currentRevisionId: string,
) {
  const { data } = await supabase
    .from("chapter_revisions")
    .select("id, content_blocks, content_hash")
    .eq("id", currentRevisionId)
    .maybeSingle();

  if (!data) return null;

  return {
    revisionId: data.id as string,
    contentHash: data.content_hash as string,
    content: data.content_blocks as ChapterRevisionContent,
  };
}

export async function getReadingProgress(
  supabase: SupabaseClient<Database>,
  userId: string,
  storyId: string,
) {
  const { data } = await supabase
    .from("reading_progress")
    .select("chapter_id, paragraph_anchor_id")
    .eq("user_id", userId)
    .eq("story_id", storyId)
    .maybeSingle();
  return data;
}

export async function getChapterReadStates(
  supabase: SupabaseClient<Database>,
  userId: string,
  storyId: string,
) {
  const { data } = await supabase
    .from("chapter_read_states")
    .select("chapter_id, max_progress_pct, completed_content_hash")
    .eq("user_id", userId)
    .eq("story_id", storyId);

  const map = new Map<string, { maxProgressPct: number; completedContentHash: string | null }>();
  for (const row of data ?? []) {
    map.set(row.chapter_id, {
      maxProgressPct: row.max_progress_pct,
      completedContentHash: row.completed_content_hash,
    });
  }
  return map;
}

const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontSizeStep: 1,
  lineHeight: 1.7,
  theme: "light",
};

export async function getReadingSettings(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ReadingSettings> {
  const { data } = await supabase
    .from("reading_settings")
    .select("font_size_step, line_height, theme")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return DEFAULT_READING_SETTINGS;

  return {
    fontSizeStep: data.font_size_step,
    lineHeight: Number(data.line_height),
    theme: data.theme,
  };
}

export function blockPlainText(block: Block): string {
  return block.text;
}
