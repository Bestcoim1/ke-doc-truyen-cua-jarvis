import {
  buildImportedStory,
  type DraftSection,
  type ImportDraft,
} from "./text-parser";

const UNSECTIONED_TITLE = "Chưa phân hồi";

export type OrderedImportDraft = {
  filename: string;
  draft: ImportDraft;
};

function namespaceSections(
  sections: DraftSection[],
  sourceIndex: number,
): DraftSection[] {
  const sourcePrefix = `batch/${sourceIndex + 1}`;

  return sections.map((section) => ({
    ...section,
    chapters: section.chapters.map((chapter) => ({
      ...chapter,
      sourceKey: `${sourcePrefix}/${chapter.sourceKey}`.slice(0, 1_000),
    })),
    children: namespaceSections(section.children, sourceIndex),
  }));
}

function canMergeUnsectioned(section: DraftSection): boolean {
  return (
    section.title === UNSECTIONED_TITLE &&
    section.type === "arc" &&
    section.children.length === 0
  );
}

/**
 * Combines independently parsed files in the exact order chosen by the user.
 * Synthetic "Chưa phân hồi" containers are collapsed when adjacent so a
 * folder of one-chapter files does not create one redundant section per file.
 */
export function mergeOrderedImportDrafts(
  sources: OrderedImportDraft[],
  options: { title: string; description?: string },
): ImportDraft {
  if (sources.length === 0) {
    throw new Error("Cần ít nhất một file để tạo bản review.");
  }

  const sections: DraftSection[] = [];
  const warnings: string[] = [];

  sources.forEach(({ filename, draft }, sourceIndex) => {
    const sourceLabel = `[${sourceIndex + 1}/${sources.length} · ${filename}]`;
    warnings.push(
      ...draft.warnings.map((warning) => `${sourceLabel} ${warning}`),
    );

    for (const section of namespaceSections(draft.sections, sourceIndex)) {
      const previous = sections.at(-1);
      if (
        previous &&
        canMergeUnsectioned(previous) &&
        canMergeUnsectioned(section)
      ) {
        previous.chapters.push(...section.chapters);
      } else {
        sections.push(section);
      }
    }
  });

  return buildImportedStory({
    title: options.title,
    description: options.description,
    sourceType: "batch",
    sections,
    warnings,
  });
}
