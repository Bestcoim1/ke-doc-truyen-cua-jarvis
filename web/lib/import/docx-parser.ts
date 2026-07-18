import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

import { looksLikeZip } from "./file-validation";
import {
  classifyImportedHeading,
  parseLogicalLines,
  type ImportDraft,
  type LogicalLine,
  type ParseStoryTextOptions,
} from "./text-parser";

// Per-entry decompressed size cap, enforced while streaming (not from the
// zip's own declared size, which a crafted archive can lie about) — this is
// the actual zip-bomb defense. We only ever read two small, fixed entries
// (never "extract everything"), so this cap alone is enough: nothing else
// in the archive is ever decompressed.
export const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10_000;

type XmlNode = Record<string, unknown> & { ":@"?: Record<string, unknown> };

type DocxHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type ExtractedDocxParagraph = {
  text: string;
  headingLevel?: DocxHeadingLevel;
  isDocumentTitle?: boolean;
};

function childArray(node: XmlNode, tag: string): XmlNode[] {
  const value = node[tag];
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function findFirst(nodes: XmlNode[], tag: string): XmlNode | undefined {
  return nodes.find((node) => tag in node);
}

/**
 * zip-slip / path traversal defense: we never write extracted content to
 * disk using entry-derived paths (we only ever read two hardcoded entry
 * names), so there's no actual traversal-write vector here — but a crafted
 * archive with ".."-laden entry names is still a signal of tampering worth
 * rejecting outright rather than silently ignoring.
 */
function assertSafeEntryNames(zip: JSZip): void {
  const names = Object.keys(zip.files);
  if (names.length > MAX_ZIP_ENTRIES) {
    throw new Error(
      "File DOCX có quá nhiều thành phần bên trong — có thể không hợp lệ.",
    );
  }
  for (const name of names) {
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      name.startsWith("\\") ||
      /^[a-zA-Z]:/.test(name)
    ) {
      throw new Error("File DOCX chứa đường dẫn không hợp lệ bên trong.");
    }
  }
}

/**
 * Reads one zip entry as UTF-8 text via a streaming decompress, aborting as
 * soon as more than maxBytes have come out — regardless of what the zip's
 * local/central-directory headers claim the size is. This is what actually
 * bounds memory use against a zip bomb; a one-shot entry.async("string")
 * call would materialize the full decompressed content before we could
 * ever check its length.
 */
async function readZipEntry(
  zip: JSZip,
  path: string,
  maxBytes: number,
): Promise<string> {
  const entry = zip.file(path);
  if (!entry) throw new Error(`File DOCX thiếu thành phần bắt buộc: ${path}.`);

  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = entry.nodeStream("nodebuffer");
    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        stream.removeAllListeners();
        if ("destroy" in stream && typeof stream.destroy === "function")
          stream.destroy();
        reject(new Error("Nội dung file DOCX vượt quá giới hạn cho phép."));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", (error: Error) => reject(error));
  });
}



/** Recursively concatenates run text (w:t), tabs and line breaks, in document order. */
function extractParagraphText(node: XmlNode): string {
  let text = "";
  for (const [key, value] of Object.entries(node)) {
    if (key === ":@" || key === "w:pPr" || key === "w:rPr") continue;

    if (key === "w:t") {
      for (const child of Array.isArray(value) ? value : []) {
        if (
          child &&
          typeof child === "object" &&
          "#text" in (child as Record<string, unknown>)
        ) {
          text += String((child as Record<string, unknown>)["#text"]);
        }
      }
      continue;
    }
    if (key === "w:tab") {
      text += "\t";
      continue;
    }
    if (key === "w:br" || key === "w:cr") {
      text += "\n";
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object")
          text += extractParagraphText(child as XmlNode);
      }
    }
  }
  return text;
}

function parseParagraphStyle(styleId: string): Pick<
  ExtractedDocxParagraph,
  "headingLevel" | "isDocumentTitle"
> {
  const normalized = styleId.toLowerCase().replace(/[\s\-_]/g, "");
  if (/^(?:title|tiêuđề)$/u.test(normalized)) {
    return { isDocumentTitle: true };
  }

  const headingMatch = normalized.match(/^(?:heading|tiêuđề|h)([1-9])$/u);
  if (!headingMatch) return {};

  return { headingLevel: Number(headingMatch[1]) as DocxHeadingLevel };
}

function extractParagraphs(bodyChildren: XmlNode[]): ExtractedDocxParagraph[] {
  const paragraphs: ExtractedDocxParagraph[] = [];

  for (const node of bodyChildren) {
    if (!("w:p" in node)) continue; // tables, section properties, etc. are out of scope
    const children = childArray(node, "w:p");
    const pPr = findFirst(children, "w:pPr");
    let paragraphStyle: Pick<
      ExtractedDocxParagraph,
      "headingLevel" | "isDocumentTitle"
    > = {};
    if (pPr) {
      const pStyle = findFirst(childArray(pPr, "w:pPr"), "w:pStyle");
      const styleId = pStyle?.[":@"]?.["@_w:val"];
      if (typeof styleId === "string") {
        paragraphStyle = parseParagraphStyle(styleId);
      }
    }
    paragraphs.push({
      text: extractParagraphText(node).trim(),
      ...paragraphStyle,
    });
  }

  return paragraphs;
}

type HeadingPlan = {
  hintsByParagraph: Map<number, 1 | 2>;
  sectionDepthByParagraph: Map<number, 0 | 1>;
  ignoredParagraphs: Set<number>;
  preferHeadingHints: boolean;
  documentTitle?: string;
};

/**
 * DOCX heading numbers are relative to the author's document, not to our
 * Story → Section → Chapter model. A common Vietnamese Word layout is:
 * Heading 1 = document title, Heading 2 = Hồi, Heading 3 = Chương. Scan the
 * complete heading outline first, infer its chapter tier, and only then map
 * levels to our two-tier structure.
 */
export function inferDocxHeadingPlan(
  paragraphs: ExtractedDocxParagraph[],
): HeadingPlan {
  const hintsByParagraph = new Map<number, 1 | 2>();
  const sectionDepthByParagraph = new Map<number, 0 | 1>();
  const ignoredParagraphs = new Set<number>();
  let documentTitle: string | undefined;

  const headingEntries = paragraphs.flatMap((paragraph, index) => {
    if (!paragraph.text) return [];
    if (paragraph.isDocumentTitle) {
      ignoredParagraphs.add(index);
      documentTitle ??= paragraph.text;
      return [];
    }
    if (!paragraph.headingLevel) return [];
    return [
      {
        index,
        level: paragraph.headingLevel,
        text: paragraph.text,
        textRole: classifyImportedHeading(paragraph.text),
      },
    ];
  });

  if (headingEntries.length === 0) {
    return {
      hintsByParagraph,
      sectionDepthByParagraph,
      ignoredParagraphs,
      preferHeadingHints: false,
      ...(documentTitle ? { documentTitle } : {}),
    };
  }

  const levels = [...new Set(headingEntries.map((entry) => entry.level))].sort(
    (a, b) => a - b,
  );
  const chapterHits = new Map<number, number>();
  const sectionHits = new Map<number, number>();

  for (const entry of headingEntries) {
    const bucket =
      entry.textRole === "chapter"
        ? chapterHits
        : entry.textRole === "section"
          ? sectionHits
          : null;
    if (bucket) bucket.set(entry.level, (bucket.get(entry.level) ?? 0) + 1);
  }

  const rankedChapterLevels = [...chapterHits.entries()].sort(
    ([levelA, countA], [levelB, countB]) =>
      countB - countA || levelB - levelA,
  );
  let chapterLevel = rankedChapterLevels[0]?.[0];

  if (!chapterLevel) {
    const deepestLevel = levels.at(-1);
    if (
      deepestLevel &&
      (sectionHits.get(deepestLevel) ?? 0) === 0
    ) {
      chapterLevel = deepestLevel;
    }
  }

  if (!chapterLevel) {
    // The file exposes some heading metadata but not a complete hierarchy
    // (for example Heading 1 for Hồi and plain-text Chương lines). Preserve
    // keyword fallback while still trusting recognizable styled headings.
    const sectionLevels = [
      ...new Set(
        headingEntries
          .filter((entry) => entry.textRole === "section")
          .map((entry) => entry.level),
      ),
    ].sort((a, b) => a - b);

    for (const entry of headingEntries) {
      if (entry.textRole === "section") hintsByParagraph.set(entry.index, 1);
      if (entry.textRole === "chapter") hintsByParagraph.set(entry.index, 2);
      if (entry.textRole === "section") {
        const depth = sectionLevels.indexOf(entry.level);
        sectionDepthByParagraph.set(entry.index, depth <= 0 ? 0 : 1);
      }
    }
    return {
      hintsByParagraph,
      sectionDepthByParagraph,
      ignoredParagraphs,
      preferHeadingHints: false,
      ...(documentTitle ? { documentTitle } : {}),
    };
  }

  const recognizedSectionLevels = [...sectionHits.keys()]
    .filter((level) => level < chapterLevel)
    .sort((a, b) => a - b);
  const firstRecognizedSectionLevel = recognizedSectionLevels[0];

  // A single unknown top heading above an explicit Hồi/Phần level is the
  // document/story title, not another section. This is exactly the shape of
  // Heading 1 → Heading 2 (Hồi) → Heading 3 (Chương) documents.
  if (firstRecognizedSectionLevel) {
    const shallowerEntries = headingEntries.filter(
      (entry) => entry.level < firstRecognizedSectionLevel,
    );
    if (
      shallowerEntries.length === 1 &&
      shallowerEntries[0].textRole === null
    ) {
      ignoredParagraphs.add(shallowerEntries[0].index);
      documentTitle ??= shallowerEntries[0].text;
    }
  }

  const sectionLevels = [
    ...new Set(
      headingEntries
        .filter(
          (entry) =>
            !ignoredParagraphs.has(entry.index) && entry.level < chapterLevel,
        )
        .map((entry) => entry.level),
    ),
  ].sort((a, b) => a - b);

  for (const entry of headingEntries) {
    if (ignoredParagraphs.has(entry.index)) continue;
    if (entry.level < chapterLevel) {
      hintsByParagraph.set(entry.index, 1);
      const depth = sectionLevels.indexOf(entry.level);
      sectionDepthByParagraph.set(entry.index, depth <= 0 ? 0 : 1);
    } else if (entry.level === chapterLevel) {
      hintsByParagraph.set(entry.index, 2);
    }
  }

  return {
    hintsByParagraph,
    sectionDepthByParagraph,
    ignoredParagraphs,
    preferHeadingHints: true,
    ...(documentTitle ? { documentTitle } : {}),
  };
}

/**
 * Validates and extracts (text, heading-level) pairs from a DOCX buffer.
 * Everything a malicious .docx could do to hurt us happens here: this is
 * the only place that touches zip internals or XML.
 */
export async function extractDocxParagraphs(
  buffer: Buffer,
): Promise<ExtractedDocxParagraph[]> {
  if (!looksLikeZip(buffer)) {
    throw new Error(
      "File không đúng định dạng DOCX (không phải file ZIP hợp lệ).",
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("Không thể đọc file DOCX — file có thể bị hỏng.");
  }

  assertSafeEntryNames(zip);

  const contentTypes = await readZipEntry(
    zip,
    "[Content_Types].xml",
    MAX_ENTRY_BYTES,
  );
  if (!contentTypes.includes("wordprocessingml")) {
    throw new Error("File không phải tài liệu Word (.docx) hợp lệ.");
  }

  const documentXml = await readZipEntry(
    zip,
    "word/document.xml",
    MAX_ENTRY_BYTES,
  );

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
  });

  let parsed: XmlNode[];
  try {
    parsed = parser.parse(documentXml) as XmlNode[];
  } catch {
    throw new Error("Không thể đọc nội dung DOCX — XML không hợp lệ.");
  }

  const documentNode = findFirst(parsed, "w:document");
  if (!documentNode) {
    throw new Error(
      "File DOCX thiếu nội dung tài liệu (word/document.xml không hợp lệ).",
    );
  }
  const bodyNode = findFirst(childArray(documentNode, "w:document"), "w:body");
  if (!bodyNode) {
    throw new Error("File DOCX thiếu nội dung tài liệu (thiếu w:body).");
  }

  return extractParagraphs(childArray(bodyNode, "w:body"));
}

/**
 * DOCX equivalent of parseStoryText: each Word paragraph becomes a
 * blank-line-separated "paragraph" (matching the TXT/paste convention
 * buildTextBlocks expects). The complete Word heading outline is scanned
 * before keyword fallback so Heading 1 → Heading 2 → Heading 3 documents can
 * map cleanly to document title → section → chapter.
 */
export async function parseDocxDraft(
  buffer: Buffer,
  options: ParseStoryTextOptions = {},
): Promise<ImportDraft> {
  const paragraphs = await extractDocxParagraphs(buffer);
  const headingPlan = inferDocxHeadingPlan(paragraphs);

  const lines: LogicalLine[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (headingPlan.ignoredParagraphs.has(paragraphIndex)) return;
    paragraph.text.split("\n").forEach((segment, index) => {
      lines.push({
        text: segment,
        headingHint:
          index === 0
            ? headingPlan.hintsByParagraph.get(paragraphIndex)
            : undefined,
        sectionDepth:
          index === 0
            ? headingPlan.sectionDepthByParagraph.get(paragraphIndex)
            : undefined,
      });
    });
    lines.push({ text: "" });
  });

  return parseLogicalLines(lines, {
    ...options,
    title: options.title ?? headingPlan.documentTitle,
    sourceType: "docx",
    preferHeadingHints: headingPlan.preferHeadingHints,
  });
}
