import {
  buildDraftChapterContent,
  buildImportedStory,
  splitChapterContent,
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

function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
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
  if (!Array.isArray(input.sections))
    throw new Error("Cấu trúc section không hợp lệ.");

  const seenSectionIds = new Set<string>();
  const seenChapterIds = new Set<string>();
  let sectionCount = 0;
  let chapterCount = 0;
  let characterCount = 0;

  const parseChapter = (value: unknown): DraftChapter => {
    const chapter = recordOf(value);
    const id = requiredString(chapter.id, "ID chapter", 300);
    if (seenChapterIds.has(id))
      throw new Error("Chapter bị trùng trong bản nháp.");
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
    if (
      chapterCount > MAX_CHAPTERS ||
      characterCount > MAX_CONTENT_CHARACTERS
    ) {
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
    if (seenSectionIds.has(id))
      throw new Error("Section bị trùng trong bản nháp.");
    seenSectionIds.add(id);
    sectionCount += 1;
    if (sectionCount > MAX_SECTIONS)
      throw new Error("Bản nháp có quá nhiều section.");

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

function requireChapterId(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new Error("ID chapter không hợp lệ.");
  return value;
}

function collectChapters(
  sections: DraftSection[],
  map: Map<string, DraftChapter>,
): void {
  for (const section of sections) {
    for (const chapter of section.chapters) map.set(chapter.id, chapter);
    collectChapters(section.children, map);
  }
}

const MAX_CONTENT_OPS = 500;

/**
 * Replays merge/split ops against the chapters already stored on the job
 * (never against whatever contentText the client sent — there isn't any:
 * ContentOp only carries ids and a split index). This is the trusted
 * boundary from the commit_import_job migration's follow-up comment: the
 * server, not the client, derives content_blocks/content_hash.
 */
function applyContentOps(
  base: ImportDraft,
  rawOps: unknown,
): Map<string, DraftChapter> {
  const chapters = new Map<string, DraftChapter>();
  collectChapters(base.sections, chapters);

  if (rawOps === undefined || rawOps === null) return chapters;
  if (!Array.isArray(rawOps))
    throw new Error("Danh sách thao tác không hợp lệ.");
  if (rawOps.length > MAX_CONTENT_OPS)
    throw new Error("Quá nhiều thao tác trong một lần lưu.");

  for (const raw of rawOps as unknown[]) {
    if (!raw || typeof raw !== "object")
      throw new Error("Thao tác không hợp lệ.");
    const op = raw as Record<string, unknown>;

    if (op.type === "merge") {
      const keepId = requireChapterId(op.keepChapterId);
      const mergedId = requireChapterId(op.mergedChapterId);
      const keep = chapters.get(keepId);
      const merged = chapters.get(mergedId);
      if (!keep || !merged)
        throw new Error("Chapter cần gộp không còn tồn tại.");
      const contentText = [keep.contentText, merged.contentText]
        .filter(Boolean)
        .join("\n\n");
      chapters.set(keepId, {
        ...keep,
        contentText,
        ...buildDraftChapterContent(contentText),
      });
      chapters.delete(mergedId);
      continue;
    }

    if (op.type === "split") {
      const chapterId = requireChapterId(op.chapterId);
      const newChapterId = requireChapterId(op.newChapterId);
      const blockIndex = op.blockIndex;
      if (typeof blockIndex !== "number")
        throw new Error("Vị trí tách không hợp lệ.");
      const chapter = chapters.get(chapterId);
      if (!chapter) throw new Error("Chapter cần tách không còn tồn tại.");
      if (chapters.has(newChapterId))
        throw new Error("ID chapter mới bị trùng.");

      const [firstText, secondText] = splitChapterContent(
        chapter.contentText,
        blockIndex,
      );
      chapters.set(chapterId, {
        ...chapter,
        contentText: firstText,
        ...buildDraftChapterContent(firstText),
      });
      chapters.set(newChapterId, {
        ...chapter,
        id: newChapterId,
        contentText: secondText,
        ...buildDraftChapterContent(secondText),
        sourceKey: `${chapter.sourceKey}#split`,
      });
      continue;
    }

    throw new Error("Loại thao tác không hợp lệ.");
  }

  return chapters;
}

function rebuildStructureSection(
  raw: unknown,
  contentById: Map<string, DraftChapter>,
  usedChapterIds: Set<string>,
  depth: number,
): DraftSection {
  if (depth > 1) throw new Error("Bản nháp vượt quá hai tầng section.");
  const section = recordOf(raw);
  const id = requireChapterId(section.id);
  const title = requiredString(section.title, "Tên section", 200);
  const type = section.type;
  if (type !== "arc" && type !== "part" && type !== "volume") {
    throw new Error("Loại section không hợp lệ.");
  }
  if (depth > 0 && type === "volume") {
    throw new Error("Quyển chỉ có thể ở cấp cao nhất.");
  }
  if (!Array.isArray(section.chapters) || !Array.isArray(section.children)) {
    throw new Error("Cấu trúc section không hợp lệ.");
  }

  const chapters = section.chapters.map((rawChapter): DraftChapter => {
    const chapterRef = recordOf(rawChapter);
    const chapterId = requireChapterId(chapterRef.id);
    if (usedChapterIds.has(chapterId))
      throw new Error("Chapter bị lặp trong bản nháp.");
    const content = contentById.get(chapterId);
    if (!content) throw new Error("Chapter tham chiếu không còn tồn tại.");
    usedChapterIds.add(chapterId);

    const kind = chapterRef.kind;
    if (kind !== "regular" && kind !== "extra")
      throw new Error("Loại chapter không hợp lệ.");

    return {
      ...content,
      id: chapterId,
      title: requiredString(chapterRef.title, "Tên chapter", 200),
      kind: kind as DraftChapterKind,
    };
  });

  return {
    id,
    title,
    type,
    chapters,
    children: section.children.map((child) =>
      rebuildStructureSection(child, contentById, usedChapterIds, depth + 1),
    ),
  };
}

/**
 * The commit-time trust boundary for review submissions (save and commit
 * both go through this): the client never sends prose. `structure` is a
 * StructurePayload (ids/titles/types/order/nesting only — see
 * review-draft.ts's toStructure) and `contentOps` is the list of
 * merge/split edits made since the last save (see ContentOp). Content
 * (blocks/content_hash/word_count) always comes from re-deriving it here
 * from what's already stored on the job, or — for split — from a
 * server-side split of that stored text. Title/description/sourceType are
 * taken from the job's own stored draft, matching the previous behavior of
 * reviewImportDraft (they aren't editable from this screen).
 */
export function applyReviewSubmission(
  storedDraftJson: unknown,
  structure: unknown,
  contentOps: unknown,
): ImportDraft {
  const base = normalizeImportDraft(storedDraftJson);
  const contentById = applyContentOps(base, contentOps);

  const structureRecord = recordOf(structure);
  if (!Array.isArray(structureRecord.sections)) {
    throw new Error("Cấu trúc bản nháp không hợp lệ.");
  }
  if (structureRecord.sections.length > MAX_SECTIONS) {
    throw new Error("Bản nháp có quá nhiều section.");
  }

  const usedChapterIds = new Set<string>();
  const sections = structureRecord.sections.map((section) =>
    rebuildStructureSection(section, contentById, usedChapterIds, 0),
  );
  if (usedChapterIds.size > MAX_CHAPTERS) {
    throw new Error("Bản nháp vượt quá giới hạn import.");
  }

  return buildImportedStory({
    title: base.title,
    description: base.description,
    sourceType: base.sourceType,
    sections,
    warnings: base.warnings,
  });
}
