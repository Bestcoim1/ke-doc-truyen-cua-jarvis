import {
  buildTextBlocks,
  countWords,
  splitChapterContent,
  type DraftChapter,
  type DraftChapterKind,
  type DraftSection,
  type DraftSectionType,
  type ImportDraft,
  type ImportSourceType,
  type ImportWarning,
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
      wordCount: chapters.reduce(
        (total, chapter) => total + chapter.wordCount,
        0,
      ),
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

export function deleteChapter(
  draft: ReviewDraft,
  chapterId: string,
): ReviewDraft {
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
    const chapter = section.chapters.find(
      (candidate) => candidate.id === chapterId,
    );
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
    chapters: section.chapters.filter(
      (candidate) => candidate.id !== chapterId,
    ),
  }));
  let foundTarget = false;
  const sections = mapSections(withoutChapter, (section) => {
    if (section.id !== targetSectionId) return section;
    foundTarget = true;
    return { ...section, chapters: [...section.chapters, chapter] };
  });

  return foundTarget ? { ...draft, sections } : draft;
}

function findSectionLocation(
  sections: ReviewSection[],
  sectionId: string,
  parentSectionId: string | null = null,
): { section: ReviewSection; parentSectionId: string | null } | null {
  for (const section of sections) {
    if (section.id === sectionId) return { section, parentSectionId };
    const child = findSectionLocation(
      section.children,
      sectionId,
      section.id,
    );
    if (child) return child;
  }
  return null;
}

function detachSection(
  sections: ReviewSection[],
  sectionId: string,
): { sections: ReviewSection[]; detached: ReviewSection | null } {
  let detached: ReviewSection | null = null;
  const next: ReviewSection[] = [];

  for (const section of sections) {
    if (section.id === sectionId) {
      detached = section;
      continue;
    }

    if (!detached) {
      const childResult = detachSection(section.children, sectionId);
      if (childResult.detached) {
        detached = childResult.detached;
        next.push({ ...section, children: childResult.sections });
        continue;
      }
    }
    next.push(section);
  }

  return { sections: next, detached };
}

/**
 * Moves a section between the root and one root-level parent. Import drafts
 * intentionally support at most two section levels, matching the database
 * constraint used when the story is committed.
 */
export function moveSectionToParent(
  draft: ReviewDraft,
  sectionId: string,
  parentSectionId: string | null,
): ReviewDraft {
  const target = findSectionLocation(draft.sections, sectionId);
  if (!target || target.parentSectionId === parentSectionId) return draft;

  if (parentSectionId !== null) {
    const parent = draft.sections.find(
      (section) => section.id === parentSectionId,
    );
    if (
      !parent ||
      parent.id === sectionId ||
      target.section.type === "volume" ||
      target.section.children.length > 0
    ) {
      return draft;
    }
  }

  const { sections: withoutTarget, detached } = detachSection(
    draft.sections,
    sectionId,
  );
  if (!detached) return draft;

  if (parentSectionId === null) {
    return { ...draft, sections: [...withoutTarget, detached] };
  }

  return {
    ...draft,
    sections: withoutTarget.map((section) =>
      section.id === parentSectionId
        ? { ...section, children: [...section.children, detached] }
        : section,
    ),
  };
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
  const chapterIndex = chapters.findIndex(
    (entry) => entry.chapter.id === chapterId,
  );
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

export function changeSectionType(
  draft: ReviewDraft,
  sectionId: string,
  type: DraftSectionType,
): ReviewDraft {
  return {
    ...draft,
    sections: mapSections(draft.sections, (section) =>
      section.id === sectionId ? { ...section, type } : section,
    ),
  };
}

function reorderInArray<T extends { id: string }>(
  items: T[],
  id: string,
  direction: "up" | "down",
): T[] | null {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function reorderChapter(
  draft: ReviewDraft,
  chapterId: string,
  direction: "up" | "down",
): ReviewDraft {
  return {
    ...draft,
    sections: mapSections(draft.sections, (section) => {
      const chapters = reorderInArray(section.chapters, chapterId, direction);
      return chapters ? { ...section, chapters } : section;
    }),
  };
}

export function reorderSection(
  draft: ReviewDraft,
  sectionId: string,
  direction: "up" | "down",
): ReviewDraft {
  const topLevel = reorderInArray(draft.sections, sectionId, direction);
  if (topLevel) return { ...draft, sections: topLevel };

  return {
    ...draft,
    sections: draft.sections.map((section) => {
      const children = reorderInArray(section.children, sectionId, direction);
      return children ? { ...section, children } : section;
    }),
  };
}

/**
 * Splits a chapter's content into two chapters at a paragraph/scene-break
 * boundary (blockIndex, see splitChapterContent). newChapterId is generated
 * by the caller so the same id can be recorded in the ContentOp sent to the
 * server at save/commit time — see toStructure and lib/import/actions.ts.
 */
export function splitChapter(
  draft: ReviewDraft,
  chapterId: string,
  blockIndex: number,
  newChapterId: string,
): ReviewDraft {
  const chapter = findChapter(draft.sections, chapterId);
  if (!chapter) return draft;

  let firstText: string;
  let secondText: string;
  try {
    [firstText, secondText] = splitChapterContent(
      chapter.contentText,
      blockIndex,
    );
  } catch {
    return draft;
  }

  const firstChapter: ReviewChapter = {
    ...chapter,
    contentText: firstText,
    wordCount: countWords(buildTextBlocks(firstText)),
  };
  const secondChapter: ReviewChapter = {
    id: newChapterId,
    title: `${chapter.title} (tiếp theo)`,
    kind: chapter.kind,
    contentText: secondText,
    wordCount: countWords(buildTextBlocks(secondText)),
    sourceKey: `${chapter.sourceKey}#split`,
  };

  const sections = mapSections(draft.sections, (section) => ({
    ...section,
    chapters: section.chapters.flatMap((candidate) =>
      candidate.id === chapterId ? [firstChapter, secondChapter] : [candidate],
    ),
  }));

  return recalculateReviewStats({ ...draft, sections });
}

/** Content-mutating edits since the last save/commit — see draft-validation.ts's applyReviewSubmission. */
export type ContentOp =
  | { type: "merge"; keepChapterId: string; mergedChapterId: string }
  | {
      type: "split";
      chapterId: string;
      blockIndex: number;
      newChapterId: string;
    };

export type StructureChapter = {
  id: string;
  title: string;
  kind: DraftChapterKind;
};

export type StructureSection = {
  id: string;
  title: string;
  type: DraftSectionType;
  chapters: StructureChapter[];
  children: StructureSection[];
};

export type StructurePayload = {
  sections: StructureSection[];
};

/**
 * Strips prose (contentText/blocks/wordCount/sourceKey) out of the draft,
 * leaving only what's needed to describe structure — this, not the full
 * draft, is what gets sent to the server on save/commit. See
 * lib/import/actions.ts and draft-validation.ts's applyReviewSubmission.
 */
export function toStructure(draft: ReviewDraft): StructurePayload {
  const convertSection = (section: ReviewSection): StructureSection => ({
    id: section.id,
    title: section.title,
    type: section.type,
    chapters: section.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      kind: chapter.kind,
    })),
    children: section.children.map(convertSection),
  });

  return { sections: draft.sections.map(convertSection) };
}
