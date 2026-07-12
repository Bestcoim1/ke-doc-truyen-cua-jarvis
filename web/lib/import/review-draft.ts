import type {
  DraftChapter,
  DraftSection,
  DraftSectionType,
  ImportDraft,
  ImportSourceType,
  ImportWarning,
} from "./text-parser";

export type ReviewChapter = Omit<DraftChapter, "blocks" | "contentHash">;

export type ReviewSection = {
  id: string;
  title: string;
  type: DraftSectionType;
  children: ReviewSection[];
  chapters: ReviewChapter[];
};

export type ReviewDraft = {
  title?: string;
  description?: string;
  sourceType: ImportSourceType;
  sections: ReviewSection[];
  warnings: ImportWarning[];
  stats: ImportDraft["stats"];
};

export type SectionOption = {
  id: string;
  title: string;
  depth: number;
};

function mapSection(section: DraftSection): ReviewSection {
  return {
    id: section.id,
    title: section.title,
    type: section.type,
    chapters: section.chapters.map(
      ({ id, title, kind, contentText, wordCount, sourceKey }) => ({
        id,
        title,
        kind,
        contentText,
        wordCount,
        sourceKey,
      }),
    ),
    children: section.children.map(mapSection),
  };
}

export function toReviewDraft(draft: ImportDraft): ReviewDraft {
  return {
    ...(draft.title ? { title: draft.title } : {}),
    ...(draft.description ? { description: draft.description } : {}),
    sourceType: draft.sourceType,
    sections: draft.sections.map(mapSection),
    warnings: [...draft.warnings],
    stats: { ...draft.stats },
  };
}

function allChapters(sections: ReviewSection[]): ReviewChapter[] {
  return sections.flatMap((section) => [
    ...section.chapters,
    ...allChapters(section.children),
  ]);
}

export function recalculateReviewStats(draft: ReviewDraft): ReviewDraft {
  const chapters = allChapters(draft.sections);
  const countSections = (sections: ReviewSection[]): number =>
    sections.reduce(
      (total, section) => total + 1 + countSections(section.children),
      0,
    );

  return {
    ...draft,
    stats: {
      sectionCount: countSections(draft.sections),
      chapterCount: chapters.length,
      wordCount: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
      characterCount: chapters.reduce(
        (total, chapter) => total + chapter.contentText.length,
        0,
      ),
    },
  };
}

function mapSections(
  sections: ReviewSection[],
  mapper: (section: ReviewSection) => ReviewSection,
): ReviewSection[] {
  return sections.map((section) =>
    mapper({ ...section, children: mapSections(section.children, mapper) }),
  );
}

export function renameSection(
  draft: ReviewDraft,
  sectionId: string,
  title: string,
): ReviewDraft {
  return {
    ...draft,
    sections: mapSections(draft.sections, (section) =>
      section.id === sectionId ? { ...section, title } : section,
    ),
  };
}

export function renameChapter(
  draft: ReviewDraft,
  chapterId: string,
  title: string,
): ReviewDraft {
  return {
    ...draft,
    sections: mapSections(draft.sections, (section) => ({
      ...section,
      chapters: section.chapters.map((chapter) =>
        chapter.id === chapterId ? { ...chapter, title } : chapter,
      ),
    })),
  };
}

export function deleteChapter(draft: ReviewDraft, chapterId: string): ReviewDraft {
  return recalculateReviewStats({
    ...draft,
    sections: mapSections(draft.sections, (section) => ({
      ...section,
      chapters: section.chapters.filter((chapter) => chapter.id !== chapterId),
    })),
  });
}

function findChapter(
  sections: ReviewSection[],
  chapterId: string,
): ReviewChapter | undefined {
  for (const section of sections) {
    const chapter = section.chapters.find((candidate) => candidate.id === chapterId);
    if (chapter) return chapter;
    const childChapter = findChapter(section.children, chapterId);
    if (childChapter) return childChapter;
  }
  return undefined;
}

export function moveChapter(
  draft: ReviewDraft,
  chapterId: string,
  targetSectionId: string,
): ReviewDraft {
  const chapter = findChapter(draft.sections, chapterId);
  if (!chapter) return draft;

  const withoutChapter = mapSections(draft.sections, (section) => ({
    ...section,
    chapters: section.chapters.filter((candidate) => candidate.id !== chapterId),
  }));
  let foundTarget = false;
  const sections = mapSections(withoutChapter, (section) => {
    if (section.id !== targetSectionId) return section;
    foundTarget = true;
    return { ...section, chapters: [...section.chapters, chapter] };
  });

  return foundTarget ? { ...draft, sections } : draft;
}

export function flattenSectionOptions(
  sections: ReviewSection[],
  depth = 0,
): SectionOption[] {
  return sections.flatMap((section) => [
    { id: section.id, title: section.title, depth },
    ...flattenSectionOptions(section.children, depth + 1),
  ]);
}

export function flattenReviewChapters(
  sections: ReviewSection[],
): { sectionId: string; chapter: ReviewChapter }[] {
  return sections.flatMap((section) => [
    ...section.chapters.map((chapter) => ({ sectionId: section.id, chapter })),
    ...flattenReviewChapters(section.children),
  ]);
}

export function mergeChapterWithPrevious(
  draft: ReviewDraft,
  chapterId: string,
): ReviewDraft {
  const chapters = flattenReviewChapters(draft.sections);
  const chapterIndex = chapters.findIndex((entry) => entry.chapter.id === chapterId);
  if (chapterIndex <= 0) return draft;

  const previous = chapters[chapterIndex - 1].chapter;
  const current = chapters[chapterIndex].chapter;
  const contentText = [previous.contentText, current.contentText]
    .filter(Boolean)
    .join("\n\n");

  const sections = mapSections(draft.sections, (section) => ({
    ...section,
    chapters: section.chapters
      .filter((chapter) => chapter.id !== current.id)
      .map((chapter) =>
        chapter.id === previous.id
          ? {
              ...chapter,
              contentText,
              wordCount: previous.wordCount + current.wordCount,
            }
          : chapter,
      ),
  }));

  return recalculateReviewStats({ ...draft, sections });
}
