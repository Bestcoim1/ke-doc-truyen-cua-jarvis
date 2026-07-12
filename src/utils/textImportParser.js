export const NO_CHAPTERS_MESSAGE =
  'Chưa tìm thấy chương nào. Hãy kiểm tra tiêu đề chương như Chương 1, Chapter 1, Ngoại truyện 1...';

const NUMBERED_TITLE_SUFFIX = '(?:\\s*[:._\\-–—]\\s*.*|\\s+.*)?';
const ROMAN_INDEX =
  '(?=[ivxlcdm]+(?:\\s|[:._\\-–—]|$))m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})';
const INDEX_TOKEN = `(?:\\d+(?:\\.\\d+)*|${ROMAN_INDEX})`;

const SECTION_HEADER_PATTERN = new RegExp(
  `^(?:hồi|phần|quyển|arc|part|volume)\\s+${INDEX_TOKEN}${NUMBERED_TITLE_SUFFIX}$`,
  'iu',
);

const NUMBERED_CHAPTER_HEADER_PATTERN = new RegExp(
  `^(?:chương|chapter|chap|ngoại\\s*truyện|extra|side\\s+story)\\s+${INDEX_TOKEN}${NUMBERED_TITLE_SUFFIX}$`,
  'iu',
);

const UNNUMBERED_EXTRA_HEADER_PATTERN =
  /^ngoại\s*truyện(?:\s*[:._\-–—]\s*.*)?$/iu;

export function classifyImportedHeading(line) {
  const normalized = String(line || '').trim();
  if (!normalized) return null;
  if (SECTION_HEADER_PATTERN.test(normalized)) return 'section';
  if (
    NUMBERED_CHAPTER_HEADER_PATTERN.test(normalized) ||
    UNNUMBERED_EXTRA_HEADER_PATTERN.test(normalized)
  ) {
    return 'chapter';
  }
  return null;
}

function contentFromLines(lines) {
  let firstContentLine = 0;
  let lastContentLine = lines.length;

  while (firstContentLine < lastContentLine && !lines[firstContentLine].trim()) {
    firstContentLine += 1;
  }
  while (lastContentLine > firstContentLine && !lines[lastContentLine - 1].trim()) {
    lastContentLine -= 1;
  }

  return lines.slice(firstContentLine, lastContentLine).join('\n');
}

function createParseIdFactory() {
  let parseId;

  try {
    parseId = globalThis.crypto?.randomUUID?.();
  } catch {
    parseId = null;
  }

  if (!parseId) {
    parseId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  let sectionNumber = 0;
  let chapterNumber = 0;

  return (type) => {
    if (type === 'section') {
      sectionNumber += 1;
      return `section-${parseId}-${sectionNumber}`;
    }

    chapterNumber += 1;
    return `chapter-${parseId}-${chapterNumber}`;
  };
}

export function parseStoryText(rawText) {
  const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n');
  const createId = createParseIdFactory();
  const warnings = [];
  const sections = [];

  let currentSection = null;
  let currentChapter = null;
  let pendingLines = [];

  function addWarning(message) {
    if (!warnings.includes(message)) warnings.push(message);
  }

  function createSection(title) {
    const section = {
      id: createId('section'),
      title,
      chapters: [],
    };
    sections.push(section);
    return section;
  }

  function ensureCurrentSection() {
    if (!currentSection) {
      currentSection = createSection('Chưa phân hồi');
      addWarning('Các chương đứng trước hồi/phần đầu tiên đã được đưa vào “Chưa phân hồi”.');
    }
    return currentSection;
  }

  function finishCurrentChapter() {
    if (!currentChapter) return;

    currentChapter.content = contentFromLines(currentChapter.lines);
    delete currentChapter.lines;

    if (!currentChapter.content) {
      addWarning(`Chương “${currentChapter.title}” chưa có nội dung.`);
    }

    ensureCurrentSection().chapters.push(currentChapter);
    currentChapter = null;
  }

  lines.forEach((line) => {
    const normalizedLine = line.trim();
    const headingType = classifyImportedHeading(normalizedLine);

    if (headingType === 'section') {
      finishCurrentChapter();
      currentSection = createSection(normalizedLine);
      return;
    }

    if (headingType === 'chapter') {
      finishCurrentChapter();
      ensureCurrentSection();

      if (pendingLines.some((pendingLine) => pendingLine.trim())) {
        addWarning('Nội dung đứng trước tiêu đề chương đã được ghép vào chương đầu tiên tiếp theo.');
      }

      currentChapter = {
        id: createId('chapter'),
        title: normalizedLine,
        content: '',
        lines: pendingLines,
      };
      pendingLines = [];
      return;
    }

    if (currentChapter) currentChapter.lines.push(line);
    else pendingLines.push(line);
  });

  finishCurrentChapter();

  const populatedSections = sections.filter((section) => section.chapters.length > 0);
  const emptySectionCount = sections.length - populatedSections.length;
  if (emptySectionCount > 0) {
    addWarning(
      `Đã bỏ ${emptySectionCount} hồi/phần không có chương khỏi kết quả import.`,
    );
  }

  const chapterCount = populatedSections.reduce(
    (total, section) => total + section.chapters.length,
    0,
  );

  if (chapterCount === 0) {
    return {
      sections: [],
      stats: {
        sectionCount: 0,
        chapterCount: 0,
        warningCount: warnings.length,
      },
      warnings,
      error: NO_CHAPTERS_MESSAGE,
    };
  }

  return {
    sections: populatedSections,
    stats: {
      sectionCount: populatedSections.length,
      chapterCount,
      warningCount: warnings.length,
    },
    warnings,
    error: null,
  };
}

// Backward-compatible alias for callers from the first text-import prototype.
export const parseImportedText = parseStoryText;

export function buildImportedStory(importedStory, options = {}) {
  const timestamp = options.timestamp ?? Date.now();
  const randomPart = options.randomPart ?? Math.floor(Math.random() * 1000);
  const id = 'story' + timestamp + randomPart;
  let chapterNumber = 0;

  const sections = importedStory.sections.map((section, sectionIndex) => ({
    id: section.id || `${id}-sec-${sectionIndex + 1}`,
    title: section.title,
    chapters: section.chapters.map((chapter) => {
      chapterNumber += 1;
      return {
        id: chapter.id || `${id}-ch-${chapterNumber}`,
        title: chapter.title,
        content: chapter.content,
      };
    }),
  }));

  return {
    id,
    title: importedStory.title,
    author: importedStory.author || null,
    source: {
      type: 'pasted_text',
      importedAt: new Date(timestamp).toISOString(),
    },
    sections,
  };
}
