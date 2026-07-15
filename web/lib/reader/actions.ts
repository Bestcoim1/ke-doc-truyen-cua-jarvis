"use server";

import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";
import type { ReadingSettings } from "./types";

// Progress and chapter-state writes moved to /api/reader/progress so the
// client can use keepalive fetch — Server Action POSTs get aborted when a
// flush coincides with navigation/pagehide (see that route's docblock).
// Settings updates only happen while the page is alive, so a Server
// Action remains the simplest correct tool here.

export async function updateReadingSettings(patch: Partial<ReadingSettings>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return;

  const current = await supabase
    .from("reading_settings")
    .select("font_size_step, line_height, theme")
    .eq("user_id", userId)
    .maybeSingle();
  if (current.error) {
    logEvent("reader.settings_current_query_error", {
      code: current.error.code,
    });
  }

  const next = {
    user_id: userId,
    font_size_step: patch.fontSizeStep ?? current.data?.font_size_step ?? 1,
    line_height: patch.lineHeight ?? current.data?.line_height ?? 1.7,
    theme: patch.theme ?? current.data?.theme ?? "light",
  };

  const { error } = await supabase.from("reading_settings").upsert(next);
  if (error) {
    logEvent("reader.settings_save_error", { code: error.code });
  }
}

export async function createAnnotation({
  storyId,
  chapterId,
  anchorId,
  startOffset,
  endOffset,
  color,
  note,
}: {
  storyId: string;
  chapterId: string;
  anchorId: string;
  startOffset: number;
  endOffset: number;
  color?: string | null;
  note?: string | null;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("chapter_annotations")
    .insert({
      user_id: userId,
      story_id: storyId,
      chapter_id: chapterId,
      anchor_id: anchorId,
      start_offset: startOffset,
      end_offset: endOffset,
      color,
      note,
    })
    .select("id")
    .single();

  if (error) {
    logEvent("reader.annotation_create_error", { code: error.code });
    throw error;
  }
  return data.id;
}

export async function updateAnnotation(
  id: string,
  patch: { color?: string | null; note?: string | null }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chapter_annotations")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAnnotation(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chapter_annotations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function getStoryForOfflineDownload(storyId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new Error("Unauthorized");

  const [{ data: story }, { data: sections }, { data: chapters }] =
    await Promise.all([
      supabase
        .from("stories")
        .select("id, title, cover_image_url")
        .eq("id", storyId)
        .eq("owner_id", userId)
        .single(),
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

  if (!story || !chapters) {
    throw new Error("Story not found");
  }

  // Fetch all revisions
  const revisionIds = chapters
    .map((c) => c.current_revision_id)
    .filter(Boolean) as string[];

  const { data: revisions } = await supabase
    .from("chapter_revisions")
    .select("id, content_blocks, content_hash, chapter_id")
    .in("id", revisionIds);

  const { data: annotations } = await supabase
    .from("chapter_annotations")
    .select("*")
    .eq("story_id", storyId)
    .eq("user_id", userId);

  return {
    story,
    sections: sections ?? [],
    chapters: chapters ?? [],
    revisions: revisions ?? [],
    annotations: annotations ?? [],
  };
}
