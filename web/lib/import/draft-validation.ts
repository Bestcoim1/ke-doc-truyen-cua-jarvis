import {
  buildDraftChapterContent,
  buildImportedStory,
  type DraftChapter,
  type DraftChapterKind,
  type DraftSection,
  type DraftSectionType,
  type ImportDraft,
  type ImportSourceType,
  type ImportWarning,
} from "./text-parser";

const MAX_SECTIONS = 2_000;
const MAX_CHAPTERS = 1_000;
const MAX_CONTENT_CHARACTERS = 5_000_000;

function recordOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Dữ liệu bản nháp không hợp lệ.");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} không hợp lệ.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} phải có từ 1 đến ${maxLength} ký tự.`);
  }
  return normalized;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Mô tả không hợp lệ.");
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error("Mô tả quá dài.");
  return normalized || undefined;
}

export function normalizeImportDraft(
  value: unknown,
  warningOverride?: ImportWarning[],
): ImportDraft {
  const input = recordOf(value);
  const title = requiredString(input.title, "Tên tác phẩm", 200);
  const description = optionalString(input.description, 5_000);
  const sourceType = input.sourceType;
  if (sourceType !== "paste" && sourceType !== "txt" && sourceType !== "docx") {
    throw new Error("Nguồn import không hợp lệ.");
  }
  if (!Array.isArray(input.sections)) throw new Error("Cấu trúc section không hợp lệ.");

  const seenSectionIds = new Set<string>();
  const seenChapterIds = new Set<string>();
  let sectionCount = 0;
  let chapterCount = 0;
  let characterCount = 0;

  const parseChapter = (value: unknown): DraftChapter => {
    const chapter = recordOf(value);
    const id = requiredString(chapter.id, "ID chapter", 300);
    if (seenChapterIds.has(id)) throw new Error("Chapter bị trùng trong bản nháp.");
    seenChapterIds.add(id);

    const kind = chapter.kind;
    if (kind !== "regular" && kind !== "extra") {
      throw new Error("Loại chapter không hợp lệ.");
    }
    if (typeof chapter.contentText !== "string") {
      throw new Error("Nội dung chapter không hợp lệ.");
    }
    characterCount += chapter.contentText.length;
    chapterCount += 1;
    if (chapterCount > MAX_CHAPTERS || characterCount > MAX_CONTENT_CHARACTERS) {
      throw new Error("Bản nháp vượt quá giới hạn import.");
    }

    const content = buildDraftChapterContent(chapter.contentText);
    return {
      id,
      title: requiredString(chapter.title, "Tên chapter", 200),
      kind: kind as DraftChapterKind,
      contentText: chapter.contentText,
      ...content,
      sourceKey: requiredString(chapter.sourceKey, "Source key", 1_000),
    };
  };

  const parseSection = (value: unknown, depth: number): DraftSection => {
    if (depth > 1) throw new Error("Bản nháp vượt quá hai tầng section.");
    const section = recordOf(value);
    const id = requiredString(section.id, "ID section", 300);
    if (seenSectionIds.has(id)) throw new Error("Section bị trùng trong bản nháp.");
    seenSectionIds.add(id);
    sectionCount += 1;
    if (sectionCount > MAX_SECTIONS) throw new Error("Bản nháp có quá nhiều section.");

    const type = section.type;
    if (type !== "arc" && type !== "part" && type !== "volume") {
      throw new Error("Loại section không hợp lệ.");
    }
    if (!Array.isArray(section.chapters) || !Array.isArray(section.children)) {
      throw new Error("Cấu trúc section không hợp lệ.");
    }

    return {
      id,
      title: requiredString(section.title, "Tên section", 200),
      type: type as DraftSectionType,
      chapters: section.chapters.map(parseChapter),
      children: section.children.map((child) => parseSection(child, depth + 1)),
    };
  };

  const warningsSource = warningOverride ?? input.warnings;
  const warnings = Array.isArray(warningsSource)
    ? warningsSource
        .filter((warning): warning is string => typeof warning === "string")
        .slice(0, 500)
    : [];
  const sections = input.sections.map((section) => parseSection(section, 0));

  return buildImportedStory({
    title,
    description,
    sourceType: sourceType as ImportSourceType,
    sections,
    warnings,
  });
}
