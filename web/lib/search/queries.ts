import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";
import { logEvent } from "@/lib/telemetry";
import {
  type ChapterRow,
  type SectionRow,
  buildFlatChapterList,
} from "@/lib/reader/tree";
import {
  DEFAULT_WRITING_STATUS,
  type WritingStatus,
} from "@/lib/writing-status";

type SearchStoryRow = {
  id: string;
  title: string;
  last_read_at: string | null;
  updated_at: string;
  writing_status?: WritingStatus | null;
};
type SearchSectionRow = SectionRow & {
  story_id: string;
  type: Database["public"]["Enums"]["section_type"];
};
type SearchChapterRow = ChapterRow & { story_id: string };

export type SearchResult =
  | {
      kind: "story";
      id: string;
      title: string;
      href: string;
      subtitle: string;
      writingStatus: WritingStatus;
    }
  | {
      kind: "section";
      id: string;
      title: string;
      href: string;
      subtitle: string;
      sectionType: Database["public"]["Enums"]["section_type"];
    }
  | {
      kind: "chapter";
      id: string;
      title: string;
      href: string;
      subtitle: string;
      chapterOrdinal: number;
    };

export type LibrarySearchData = {
  query: string;
  suggestions: SearchResult[];
  results: SearchResult[];
  error: string | null;
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function includesQuery(value: string, query: string) {
  return normalized(value).includes(normalized(query));
}

function sectionTypeLabel(type: SearchSectionRow["type"]) {
  if (type === "volume") return "Quyển";
  if (type === "arc") return "Hồi / Arc";
  return "Phần";
}

function isMissingWritingStatusError(
  error: { code?: string; message?: string } | null,
) {
  return Boolean(
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      error.message?.includes("writing_status")),
  );
}

async function getSearchStoryRows(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<{ stories: SearchStoryRow[] | null; error: string | null }> {
  const withWritingStatus = await supabase
    .from("stories")
    .select("id, title, last_read_at, updated_at, writing_status")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .order("last_read_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (!withWritingStatus.error) {
    return { stories: withWritingStatus.data as SearchStoryRow[], error: null };
  }

  if (!isMissingWritingStatusError(withWritingStatus.error)) {
    logEvent("search.stories_query_error", {
      code: withWritingStatus.error.code,
    });
    return { stories: null, error: withWritingStatus.error.code };
  }

  logEvent("search.writing_status_missing_fallback", {
    code: withWritingStatus.error.code,
  });
  const withoutWritingStatus = await supabase
    .from("stories")
    .select("id, title, last_read_at, updated_at")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .order("last_read_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (withoutWritingStatus.error) {
    logEvent("search.stories_query_error", {
      code: withoutWritingStatus.error.code,
    });
    return { stories: null, error: withoutWritingStatus.error.code };
  }

  return {
    stories: (withoutWritingStatus.data ?? []).map((story) => ({
      ...story,
      writing_status: DEFAULT_WRITING_STATUS,
    })),
    error: null,
  };
}

function firstChapterInSection(
  sectionId: string,
  sections: SearchSectionRow[],
  chapters: SearchChapterRow[],
) {
  const descendantIds = new Set([sectionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const section of sections) {
      if (
        section.parent_section_id &&
        descendantIds.has(section.parent_section_id) &&
        !descendantIds.has(section.id)
      ) {
        descendantIds.add(section.id);
        changed = true;
      }
    }
  }

  return chapters
    .filter(
      (chapter) => chapter.section_id && descendantIds.has(chapter.section_id),
    )
    .sort((a, b) => a.sort_order - b.sort_order)[0];
}

export async function searchLibrary(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  rawQuery: string,
): Promise<LibrarySearchData> {
  const query = rawQuery.trim();

  const { stories, error: storiesError } = await getSearchStoryRows(
    supabase,
    ownerId,
  );

  if (storiesError) {
    return { query, suggestions: [], results: [], error: storiesError };
  }

  if (!stories || stories.length === 0) {
    return { query, suggestions: [], results: [], error: null };
  }

  const storyIds = stories.map((story) => story.id);
  const [
    { data: sections, error: sectionsError },
    { data: chapters, error: chaptersError },
  ] = await Promise.all([
    supabase
      .from("sections")
      .select("id, story_id, parent_section_id, title, type, sort_order")
      .in("story_id", storyIds)
      .eq("is_active", true),
    supabase
      .from("chapters")
      .select("id, story_id, section_id, title, sort_order")
      .in("story_id", storyIds)
      .eq("is_active", true),
  ]);

  if (sectionsError)
    logEvent("search.sections_query_error", { code: sectionsError.code });
  if (chaptersError)
    logEvent("search.chapters_query_error", { code: chaptersError.code });

  const sectionRows = (sections ?? []) as SearchSectionRow[];
  const chapterRows = (chapters ?? []) as SearchChapterRow[];
  const storyById = new Map(stories.map((story) => [story.id, story]));
  const sectionsByStory = new Map<string, SearchSectionRow[]>();
  const chaptersByStory = new Map<string, SearchChapterRow[]>();

  for (const section of sectionRows) {
    const list = sectionsByStory.get(section.story_id) ?? [];
    list.push(section);
    sectionsByStory.set(section.story_id, list);
  }
  for (const chapter of chapterRows) {
    const list = chaptersByStory.get(chapter.story_id) ?? [];
    list.push(chapter);
    chaptersByStory.set(chapter.story_id, list);
  }

  const results: SearchResult[] = [];
  const suggestionResults: SearchResult[] = stories
    .slice(0, 6)
    .map((story) => ({
      kind: "story",
      id: story.id,
      title: story.title,
      href: `/read/${story.id}`,
      subtitle: "Tác phẩm gần đây trong thư viện",
      writingStatus: story.writing_status ?? DEFAULT_WRITING_STATUS,
    }));

  if (!query) {
    return { query, suggestions: suggestionResults, results: [], error: null };
  }

  for (const story of stories) {
    if (includesQuery(story.title, query)) {
      results.push({
        kind: "story",
        id: story.id,
        title: story.title,
        href: `/read/${story.id}`,
        subtitle: "Tác phẩm",
        writingStatus: story.writing_status ?? DEFAULT_WRITING_STATUS,
      });
    }
  }

  for (const section of sectionRows) {
    if (!includesQuery(section.title, query)) continue;
    const story = storyById.get(section.story_id);
    if (!story) continue;
    const firstChapter = firstChapterInSection(
      section.id,
      sectionsByStory.get(section.story_id) ?? [],
      chaptersByStory.get(section.story_id) ?? [],
    );

    results.push({
      kind: "section",
      id: section.id,
      title: section.title,
      href: firstChapter
        ? `/read/${section.story_id}/${firstChapter.id}`
        : `/read/${section.story_id}`,
      subtitle: `${sectionTypeLabel(section.type)} trong ${story.title}`,
      sectionType: section.type,
    });
  }

  for (const story of stories) {
    const storySections = sectionsByStory.get(story.id) ?? [];
    const storyChapters = chaptersByStory.get(story.id) ?? [];
    const flat = buildFlatChapterList(storySections, storyChapters);
    for (const entry of flat) {
      if (!includesQuery(entry.chapterTitle, query)) continue;
      results.push({
        kind: "chapter",
        id: entry.chapterId,
        title: entry.chapterTitle,
        href: `/read/${story.id}/${entry.chapterId}`,
        subtitle: [story.title, ...entry.sectionPath].join(" · "),
        chapterOrdinal: entry.sortKey + 1,
      });
    }
  }

  return {
    query,
    suggestions: suggestionResults,
    results: results.slice(0, 50),
    error: null,
  };
}
