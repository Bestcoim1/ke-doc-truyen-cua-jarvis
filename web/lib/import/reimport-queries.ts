import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";
import { fingerprintParagraph } from "../reader/anchors";
import type { ChapterRevisionContent } from "../reader/types";
import type { OldChapterRef, OldSectionRef } from "./reimport-match";
import { buildOldSectionPaths } from "./reimport-match";

export type ReimportStoryTree = {
  storyTitle: string;
  oldChapters: OldChapterRef[];
  oldSections: OldSectionRef[];
  baseTreeToken: string;
};

/**
 * Loads the current (live) tree of an existing, owned, active story as the
 * "old side" inputs matchChapters/matchSections need, plus baseTreeToken —
 * greatest(updated_at) across its active chapters/sections, echoed back
 * into mapping_json so commit_reimport_job can reject a stale mapping (see
 * migration 0008). Returns null if the story doesn't exist, isn't owned by
 * ownerId, or isn't active (mirrors requireUser-style ownership checks
 * elsewhere in lib/import).
 *
 * Only chapter titles/keys/paragraph fingerprints are read here, never
 * prose — the client never needs old chapter content, only enough to match
 * and label it.
 */
export async function getStoryTreeForReimport(
  supabase: SupabaseClient<Database>,
  storyId: string,
  ownerId: string,
): Promise<ReimportStoryTree | null> {
  const { data: story } = await supabase
    .from("stories")
    .select("id, title, status")
    .eq("id", storyId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!story || story.status !== "active") return null;

  const [{ data: sectionRows }, { data: chapterRows }] = await Promise.all([
    supabase
      .from("sections")
      .select("id, parent_section_id, title, type, updated_at")
      .eq("story_id", storyId)
      .eq("is_active", true),
    supabase
      .from("chapters")
      .select(
        "id, section_id, title, source_key, sort_order, updated_at, chapter_revisions!chapters_current_revision_fk(content_blocks)",
      )
      .eq("story_id", storyId)
      .eq("is_active", true),
  ]);

  const oldSections: OldSectionRef[] = (sectionRows ?? []).map((row) => ({
    id: row.id,
    parentSectionId: row.parent_section_id,
    title: row.title,
    type: row.type,
  }));
  const sectionPaths = buildOldSectionPaths(oldSections);

  const oldChapters: OldChapterRef[] = (chapterRows ?? []).map((row) => {
    const revision = row.chapter_revisions as unknown as { content_blocks: ChapterRevisionContent } | null;
    const blocks = revision?.content_blocks?.blocks ?? [];
    return {
      id: row.id,
      sectionPath: (row.section_id ? sectionPaths.get(row.section_id) : undefined) ?? "unsectioned",
      title: row.title,
      sourceKey: row.source_key,
      sortOrder: row.sort_order,
      firstParagraphFingerprint: blocks[0] ? fingerprintParagraph(blocks[0].text) : null,
      lastParagraphFingerprint: blocks.at(-1) ? fingerprintParagraph(blocks.at(-1)!.text) : null,
    };
  });

  const timestamps = [
    ...(sectionRows ?? []).map((row) => row.updated_at),
    ...(chapterRows ?? []).map((row) => row.updated_at),
  ];
  // ISO 8601 timestamps sort lexicographically in chronological order.
  const baseTreeToken = timestamps.length > 0 ? timestamps.sort().at(-1)! : new Date(0).toISOString();

  return { storyTitle: story.title, oldChapters, oldSections, baseTreeToken };
}
