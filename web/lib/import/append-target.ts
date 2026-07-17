import {
  buildImportedStory,
  type DraftChapter,
  type DraftSection,
  type DraftSectionType,
  type ImportDraft,
} from "./text-parser";
import type { SectionMatch } from "./reimport-match";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const APPEND_NEW_SECTION_VALUE = "new";

export type ExistingAppendSection = {
  id: string;
  parentSectionId: string | null;
  title: string;
  type: DraftSectionType;
  sortOrder: number;
};

export type AppendSectionOption = ExistingAppendSection & { depth: number };

function collectChapters(sections: DraftSection[]): DraftChapter[] {
  return sections.flatMap((section) => [
    ...section.chapters,
    ...collectChapters(section.children),
  ]);
}

export function orderAppendSectionOptions(
  sections: ExistingAppendSection[],
): AppendSectionOption[] {
  const children = new Map<string | null, ExistingAppendSection[]>();
  for (const section of sections) {
    const siblings = children.get(section.parentSectionId) ?? [];
    siblings.push(section);
    children.set(section.parentSectionId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, "vi"),
    );
  }

  const result: AppendSectionOption[] = [];
  const visited = new Set<string>();
  function visit(section: ExistingAppendSection, depth: number) {
    if (visited.has(section.id)) return;
    visited.add(section.id);
    result.push({ ...section, depth });
    for (const child of children.get(section.id) ?? []) visit(child, depth + 1);
  }
  for (const root of children.get(null) ?? []) visit(root, 0);
  // Keep malformed/orphaned legacy rows selectable instead of silently hiding them.
  for (const section of sections) visit(section, 0);
  return result;
}

export function appendTargetPath(
  sections: ExistingAppendSection[],
  targetSectionId: string,
): ExistingAppendSection[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const path: ExistingAppendSection[] = [];
  const visited = new Set<string>();
  let current = byId.get(targetSectionId);
  while (current) {
    if (visited.has(current.id)) throw new Error("Cấu trúc phân hồi hiện tại không hợp lệ.");
    visited.add(current.id);
    path.unshift(current);
    current = current.parentSectionId
      ? byId.get(current.parentSectionId)
      : undefined;
  }
  if (path.length === 0 || path.at(-1)?.id !== targetSectionId) {
    throw new Error("Phân hồi đích không còn tồn tại trong tác phẩm.");
  }
  if (path[0].parentSectionId !== null || path.length > 2) {
    throw new Error("Phân hồi đích có cấu trúc không được hỗ trợ.");
  }
  return path;
}

export function retargetAppendDraft(
  draft: ImportDraft,
  targetPath: ExistingAppendSection[],
): { draft: ImportDraft; sectionMatches: SectionMatch[] } {
  const chapters = collectChapters(draft.sections);
  if (chapters.length === 0) {
    throw new Error("Không tìm thấy nội dung chương để review.");
  }

  const sectionMatches: SectionMatch[] = [];
  let child: DraftSection | null = null;
  for (let index = targetPath.length - 1; index >= 0; index -= 1) {
    const target = targetPath[index];
    const section: DraftSection = {
      id: crypto.randomUUID(),
      title: target.title,
      type: target.type,
      chapters: index === targetPath.length - 1 ? chapters : [],
      children: child ? [child] : [],
    };
    sectionMatches.unshift({
      newSectionId: section.id,
      oldSectionId: target.id,
    });
    child = section;
  }

  return {
    draft: buildImportedStory({
      title: draft.title,
      description: draft.description,
      sourceType: draft.sourceType,
      sections: child ? [child] : draft.sections,
      warnings: draft.warnings,
    }),
    sectionMatches,
  };
}

export function savedAppendSectionMatches(
  mapping: unknown,
): SectionMatch[] | null {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return null;
  const record = mapping as Record<string, unknown>;
  if (!("sections" in record) || !Array.isArray(record.sections)) return null;

  return record.sections.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const match = value as Record<string, unknown>;
    return typeof match.newSectionId === "string" &&
      UUID_RE.test(match.newSectionId) &&
      typeof match.oldSectionId === "string" &&
      UUID_RE.test(match.oldSectionId)
      ? [{ newSectionId: match.newSectionId, oldSectionId: match.oldSectionId }]
      : [];
  });
}
