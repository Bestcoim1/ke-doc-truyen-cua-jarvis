import type { FlatChapterEntry } from "./types";

export type SectionRow = {
  id: string;
  parent_section_id: string | null;
  title: string;
  sort_order: number;
};

export type ChapterRow = {
  id: string;
  section_id: string | null;
  title: string;
  sort_order: number;
  current_revision_id?: string | null;
};

export type TocNode =
  | { kind: "section"; id: string; title: string; children: TocNode[] }
  | { kind: "chapter"; id: string; title: string };

function groupByParent(sections: SectionRow[], chapters: ChapterRow[]) {
  const childSections = new Map<string | null, SectionRow[]>();
  for (const section of sections) {
    const key = section.parent_section_id;
    if (!childSections.has(key)) childSections.set(key, []);
    childSections.get(key)!.push(section);
  }

  const chaptersBySection = new Map<string | null, ChapterRow[]>();
  for (const chapter of chapters) {
    const key = chapter.section_id;
    if (!chaptersBySection.has(key)) chaptersBySection.set(key, []);
    chaptersBySection.get(key)!.push(chapter);
  }

  return { childSections, chaptersBySection };
}

/**
 * Sections and chapters share one sort_order sequence per parent (per PRD
 * §7.1: a section's direct children can be a mix of sub-sections and
 * chapters), so siblings are merge-sorted by sort_order at each level.
 */
function siblingsOf(
  parentId: string | null,
  childSections: Map<string | null, SectionRow[]>,
  chaptersBySection: Map<string | null, ChapterRow[]>,
) {
  type Node =
    | { kind: "section"; sortOrder: number; section: SectionRow }
    | { kind: "chapter"; sortOrder: number; chapter: ChapterRow };

  const nodes: Node[] = [
    ...(childSections.get(parentId) ?? []).map(
      (section): Node => ({ kind: "section", sortOrder: section.sort_order, section }),
    ),
    ...(chaptersBySection.get(parentId) ?? []).map(
      (chapter): Node => ({ kind: "chapter", sortOrder: chapter.sort_order, chapter }),
    ),
  ];
  nodes.sort((a, b) => a.sortOrder - b.sortOrder);
  return nodes;
}

export function buildTocTree(sections: SectionRow[], chapters: ChapterRow[]): TocNode[] {
  const { childSections, chaptersBySection } = groupByParent(sections, chapters);

  function build(parentId: string | null): TocNode[] {
    return siblingsOf(parentId, childSections, chaptersBySection).map((node) =>
      node.kind === "section"
        ? {
            kind: "section",
            id: node.section.id,
            title: node.section.title,
            children: build(node.section.id),
          }
        : { kind: "chapter", id: node.chapter.id, title: node.chapter.title },
    );
  }

  return build(null);
}

export function buildFlatChapterList(
  sections: SectionRow[],
  chapters: ChapterRow[],
): FlatChapterEntry[] {
  const { childSections, chaptersBySection } = groupByParent(sections, chapters);
  const result: FlatChapterEntry[] = [];

  function walk(parentId: string | null, sectionTitle: string | null) {
    for (const node of siblingsOf(parentId, childSections, chaptersBySection)) {
      if (node.kind === "section") {
        walk(node.section.id, node.section.title);
      } else {
        result.push({
          chapterId: node.chapter.id,
          chapterTitle: node.chapter.title,
          sectionId: parentId,
          sectionTitle,
          sortKey: result.length,
        });
      }
    }
  }

  walk(null, null);
  return result;
}
