import { assignAnchorIds, hashContentBlocks } from "../reader/anchors";
import type { ChapterRevisionContent } from "../reader/types";

export const NO_CHAPTERS_MESSAGE =
  "Chưa tìm thấy chương nào. Hãy kiểm tra tiêu đề chương như Chương 1, Chapter 1, Ngoại truyện 1...";

const UNSECTIONED_TITLE = "Chưa phân hồi";
const UNTITLED_CHAPTER = "Chương chưa đặt tên";
const NO_CHAPTER_HEADING_WARNING =
  "Không tìm thấy tiêu đề chương; toàn bộ nội dung đã được tạo thành một chương tạm để review.";

const NUMBERED_TITLE_SUFFIX = "(?:\\s*[:._\\-–—]\\s*.*|\\s+.*)?";
const ROMAN_INDEX =
  "(?=[ivxlcdm]+(?:\\s|[:._\\-–—]|$))m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})";
const INDEX_TOKEN = `(?:\\d+(?:\\.\\d+)*|${ROMAN_INDEX})`;

const SECTION_HEADER_PATTERN = new RegExp(
  `^(?:hồi|phần|quyển|arc|part|volume)\\s+${INDEX_TOKEN}${NUMBERED_TITLE_SUFFIX}$`,
  "iu",
);

const NUMBERED_CHAPTER_HEADER_PATTERN = new RegExp(
  `^(?:chương|chapter|chap|ngoại\\s*truyện|extra|side\\s+story)\\s+${INDEX_TOKEN}${NUMBERED_TITLE_SUFFIX}$`,
  "iu",
);

const UNNUMBERED_EXTRA_HEADER_PATTERN =
  /^ngoại\s*truyện(?:\s*[:._\-–—]\s*.*)?$/iu;

const SCENE_BREAKS = new Set(["***", "* * *", "—", "---"]);

export type ImportSourceType = "paste" | "txt" | "docx";
export type ImportWarning = string;
export type ImportedHeadingType = "section" | "chapter";
export type DraftSectionType = "arc" | "part" | "volume";
export type DraftChapterKind = "regular" | "extra";

export type DraftChapter = {
  id: string;
  title: string;
  kind: DraftChapterKind;
  contentText: string;
  blocks: ChapterRevisionContent["blocks"];
  contentHash: string;
  wordCount: number;
  sourceKey: string;
};

export type DraftSection = {
  id: string;
  title: string;
  type: DraftSectionType;
  children: DraftSection[];
  chapters: DraftChapter[];
};

export type ImportDraft = {
  title?: string;
  description?: string;
  sourceType: ImportSourceType;
  sections: DraftSection[];
  warnings: ImportWarning[];
  stats: {
    sectionCount: number;
    chapterCount: number;
    wordCount: number;
    characterCount: number;
  };
};

export type ParseStoryTextOptions = {
  title?: string;
  description?: string;
  sourceType?: ImportSourceType;
};

export type BuildImportedStoryInput = {
  title?: string;
  description?: string;
  sourceType?: ImportSourceType;
  sections: DraftSection[];
  warnings?: ImportWarning[];
};

type EntityType = "section" | "chapter";

type PendingChapter = {
  id: string;
  title: string;
  kind: DraftChapterKind;
  lines: string[];
  sourceKey: string;
};

/**
 * A unit of input to parseLogicalLines. headingHint lets a caller that
 * already knows structure (DOCX's Word heading styles: 1 = Heading 1,
 * 2 = Heading 2) force section/chapter classification instead of relying on
 * classifyImportedHeading's text patterns — heading levels 3+ are
 * deliberately not representable here (per spec they become plain content,
 * not a new TOC tier). Plain text/paste input never sets headingHint, so
 * classification stays pattern-based exactly as before.
 */
export type LogicalLine = {
  text: string;
  headingHint?: 1 | 2;
};

export function classifyImportedHeading(
  line: unknown,
): ImportedHeadingType | null {
  const normalized = String(line || "").trim();
  if (!normalized) return null;
  if (SECTION_HEADER_PATTERN.test(normalized)) return "section";
  if (
    NUMBERED_CHAPTER_HEADER_PATTERN.test(normalized) ||
    UNNUMBERED_EXTRA_HEADER_PATTERN.test(normalized)
  ) {
    return "chapter";
  }
  return null;
}

function classifySectionType(heading: string): DraftSectionType {
  if (/^(?:quyển|volume)(?:\s|$)/iu.test(heading)) return "volume";
  if (/^(?:phần|part)(?:\s|$)/iu.test(heading)) return "part";
  return "arc";
}

function classifyChapterKind(heading: string): DraftChapterKind {
  return /^(?:ngoại\s*truyện|extra|side\s+story)(?:\s|[:._\-–—]|$)/iu.test(
    heading,
  )
    ? "extra"
    : "regular";
}

function contentFromLines(lines: string[]): string {
  let firstContentLine = 0;
  let lastContentLine = lines.length;

  while (
    firstContentLine < lastContentLine &&
    !lines[firstContentLine].trim()
  ) {
    firstContentLine += 1;
  }
  while (
    lastContentLine > firstContentLine &&
    !lines[lastContentLine - 1].trim()
  ) {
    lastContentLine -= 1;
  }

  return lines.slice(firstContentLine, lastContentLine).join("\n");
}

function createParseIdFactory(): (type: EntityType) => string {
  let parseId: string | undefined;

  try {
    parseId = globalThis.crypto?.randomUUID?.();
  } catch {
    parseId = undefined;
  }

  if (!parseId) {
    parseId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  let sectionNumber = 0;
  let chapterNumber = 0;

  return (type) => {
    if (type === "section") {
      sectionNumber += 1;
      return `section-${parseId}-${sectionNumber}`;
    }

    chapterNumber += 1;
    return `chapter-${parseId}-${chapterNumber}`;
  };
}

export function normalizeSourceSegment(value: string): string {
  return encodeURIComponent(
    value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase(),
  );
}

export function buildTextBlocks(
  contentText: string,
): ChapterRevisionContent["blocks"] {
  const blockSeeds: Omit<
    ChapterRevisionContent["blocks"][number],
    "anchor_id"
  >[] = [];
  let paragraphLines: string[] = [];

  const finishParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join("\n").trim();
    paragraphLines = [];
    if (!text) return;
    blockSeeds.push({ type: "paragraph", text, marks: [] });
  };

  for (const line of contentText.replace(/\r\n?/g, "\n").split("\n")) {
    const normalizedLine = line.trim();

    if (!normalizedLine) {
      finishParagraph();
      continue;
    }

    if (SCENE_BREAKS.has(normalizedLine)) {
      finishParagraph();
      blockSeeds.push({ type: "scene_break", text: normalizedLine, marks: [] });
      continue;
    }

    paragraphLines.push(line);
  }
  finishParagraph();

  return assignAnchorIds(blockSeeds).map(({ anchorId, type, text, marks }) => ({
    anchor_id: anchorId,
    type,
    text,
    marks,
  }));
}

export function countWords(blocks: ChapterRevisionContent["blocks"]): number {
  return blocks.reduce((total, block) => {
    if (block.type === "scene_break") return total;
    return (
      total +
      (block.text.match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu)?.length ?? 0)
    );
  }, 0);
}

export function buildDraftChapterContent(
  contentText: string,
): Pick<DraftChapter, "blocks" | "contentHash" | "wordCount"> {
  const blocks = buildTextBlocks(contentText);
  return {
    blocks,
    contentHash: hashContentBlocks(blocks),
    wordCount: countWords(blocks),
  };
}

/**
 * Splits contentText into two halves at a block boundary (paragraph or
 * scene-break index, 1..blocks.length-1). Re-joins each half's blocks with
 * blank-line separators rather than slicing the raw string — this loses
 * incidental whitespace but is lossless for the blocks buildDraftChapterContent
 * derives from it, which is the only thing that's ever actually stored.
 */
export function splitChapterContent(
  contentText: string,
  blockIndex: number,
): [string, string] {
  const blocks = buildTextBlocks(contentText);
  if (
    !Number.isInteger(blockIndex) ||
    blockIndex <= 0 ||
    blockIndex >= blocks.length
  ) {
    throw new Error("Vị trí tách không hợp lệ.");
  }
  const toText = (list: typeof blocks) =>
    list.map((block) => block.text).join("\n\n");
  return [
    toText(blocks.slice(0, blockIndex)),
    toText(blocks.slice(blockIndex)),
  ];
}

function countSections(sections: DraftSection[]): number {
  return sections.reduce(
    (total, section) => total + 1 + countSections(section.children),
    0,
  );
}

function allChapters(sections: DraftSection[]): DraftChapter[] {
  return sections.flatMap((section) => [
    ...section.chapters,
    ...allChapters(section.children),
  ]);
}

function pruneEmptySections(sections: DraftSection[]): DraftSection[] {
  return sections.flatMap((section) => {
    const children = pruneEmptySections(section.children);
    if (section.chapters.length === 0 && children.length === 0) return [];
    return [{ ...section, children }];
  });
}

export function buildImportedStory({
  title,
  description,
  sourceType = "paste",
  sections,
  warnings = [],
}: BuildImportedStoryInput): ImportDraft {
  const chapters = allChapters(sections);
  const normalizedTitle = title?.trim();
  const normalizedDescription = description?.trim();

  return {
    ...(normalizedTitle ? { title: normalizedTitle } : {}),
    ...(normalizedDescription ? { description: normalizedDescription } : {}),
    sourceType,
    sections,
    warnings,
    stats: {
      sectionCount: countSections(sections),
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

export const buildImportDraft = buildImportedStory;

export function parseLogicalLines(
  lines: LogicalLine[],
  options: ParseStoryTextOptions = {},
): ImportDraft {
  const createId = createParseIdFactory();
  const warnings: ImportWarning[] = [];
  const rootSections: DraftSection[] = [];
  const sectionSourcePaths = new Map<string, string>();
  const sourceKeyOccurrences = new Map<string, number>();

  let currentVolume: DraftSection | null = null;
  let currentSection: DraftSection | null = null;
  let currentChapter: PendingChapter | null = null;
  let pendingLines: string[] = [];

  const addWarning = (message: ImportWarning) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  const createSection = (
    title: string,
    type: DraftSectionType,
  ): DraftSection => {
    const section: DraftSection = {
      id: createId("section"),
      title,
      type,
      children: [],
      chapters: [],
    };
    const parent = type === "volume" ? null : currentVolume;

    if (parent) parent.children.push(section);
    else rootSections.push(section);

    const segment = `${type}:${normalizeSourceSegment(title)}`;
    const parentPath = parent ? sectionSourcePaths.get(parent.id) : undefined;
    sectionSourcePaths.set(
      section.id,
      parentPath ? `${parentPath}/${segment}` : segment,
    );

    if (type === "volume") currentVolume = section;
    currentSection = section;
    return section;
  };

  const ensureCurrentSection = (): DraftSection => {
    if (!currentSection) {
      currentSection = createSection(UNSECTIONED_TITLE, "arc");
      addWarning(
        "Các chương đứng trước hồi/phần đầu tiên đã được đưa vào “Chưa phân hồi”.",
      );
    }
    return currentSection;
  };

  const createSourceKey = (
    section: DraftSection,
    title: string,
    kind: DraftChapterKind,
  ): string => {
    const sectionPath = sectionSourcePaths.get(section.id) ?? "unsectioned";
    const baseKey = `${sectionPath}/${kind}:${normalizeSourceSegment(title)}`;
    const occurrence = sourceKeyOccurrences.get(baseKey) ?? 0;
    sourceKeyOccurrences.set(baseKey, occurrence + 1);
    return occurrence === 0 ? baseKey : `${baseKey}#${occurrence + 1}`;
  };

  const makeDraftChapter = (
    section: DraftSection,
    id: string,
    title: string,
    kind: DraftChapterKind,
    contentText: string,
    sourceKey?: string,
  ): DraftChapter => {
    const content = buildDraftChapterContent(contentText);
    return {
      id,
      title,
      kind,
      contentText,
      ...content,
      sourceKey: sourceKey ?? createSourceKey(section, title, kind),
    };
  };

  const finishCurrentChapter = () => {
    if (!currentChapter) return;

    const section = ensureCurrentSection();
    const contentText = contentFromLines(currentChapter.lines);
    const chapter = makeDraftChapter(
      section,
      currentChapter.id,
      currentChapter.title,
      currentChapter.kind,
      contentText,
      currentChapter.sourceKey,
    );

    if (!contentText) {
      addWarning(`Chương “${chapter.title}” chưa có nội dung.`);
    }

    section.chapters.push(chapter);
    currentChapter = null;
  };

  for (const logicalLine of lines) {
    const normalizedLine = logicalLine.text.trim();
    let headingType: ImportedHeadingType | null;

    if (logicalLine.headingHint === 1 || logicalLine.headingHint === 2) {
      // Trust the source document's own heading style over the text
      // pattern — but still warn if the text doesn't look like a heading
      // we'd otherwise recognize, since the title/kind guess below falls
      // back to defaults ("arc"/"regular") in that case.
      headingType = logicalLine.headingHint === 1 ? "section" : "chapter";
      if (classifyImportedHeading(normalizedLine) !== headingType) {
        addWarning(
          `Tiêu đề “${normalizedLine}” được nhận dạng theo style Heading của file gốc, không theo mẫu Chương/Hồi quen thuộc — hãy kiểm tra lại.`,
        );
      }
    } else {
      headingType = classifyImportedHeading(normalizedLine);
    }

    if (headingType === "section") {
      finishCurrentChapter();
      createSection(normalizedLine, classifySectionType(normalizedLine));
      continue;
    }

    if (headingType === "chapter") {
      finishCurrentChapter();
      const section = ensureCurrentSection();

      if (pendingLines.some((pendingLine) => pendingLine.trim())) {
        addWarning(
          "Nội dung đứng trước tiêu đề chương đã được ghép vào chương đầu tiên tiếp theo.",
        );
      }

      const kind = classifyChapterKind(normalizedLine);
      currentChapter = {
        id: createId("chapter"),
        title: normalizedLine,
        kind,
        lines: pendingLines,
        sourceKey: createSourceKey(section, normalizedLine, kind),
      };
      pendingLines = [];
      continue;
    }

    if (currentChapter) currentChapter.lines.push(logicalLine.text);
    else pendingLines.push(logicalLine.text);
  }

  finishCurrentChapter();

  const pendingContent = contentFromLines(pendingLines);
  if (pendingContent) {
    const section = ensureCurrentSection();
    const chapterTitle =
      section.title === UNSECTIONED_TITLE
        ? options.title?.trim() || UNTITLED_CHAPTER
        : section.title;
    section.chapters.push(
      makeDraftChapter(
        section,
        createId("chapter"),
        chapterTitle,
        "regular",
        pendingContent,
      ),
    );
    addWarning(NO_CHAPTER_HEADING_WARNING);
  }

  const populatedSections = pruneEmptySections(rootSections);
  const emptySectionCount =
    countSections(rootSections) - countSections(populatedSections);
  if (emptySectionCount > 0) {
    addWarning(
      `Đã bỏ ${emptySectionCount} hồi/phần không có chương khỏi kết quả import.`,
    );
  }

  if (allChapters(populatedSections).length === 0)
    addWarning(NO_CHAPTERS_MESSAGE);

  return buildImportedStory({
    title: options.title,
    description: options.description,
    sourceType: options.sourceType,
    sections: populatedSections,
    warnings,
  });
}

export function parseStoryText(
  rawText: string,
  options: ParseStoryTextOptions = {},
): ImportDraft {
  const lines: LogicalLine[] = String(rawText || "")
    .replace(/^﻿/u, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((text) => ({ text }));
  return parseLogicalLines(lines, options);
}

export const parseImportedText = parseStoryText;
