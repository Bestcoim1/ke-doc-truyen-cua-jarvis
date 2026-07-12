import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

import { looksLikeZip } from "./file-validation";
import {
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
    throw new Error("File DOCX có quá nhiều thành phần bên trong — có thể không hợp lệ.");
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
async function readZipEntry(zip: JSZip, path: string, maxBytes: number): Promise<string> {
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
        if ("destroy" in stream && typeof stream.destroy === "function") stream.destroy();
        reject(new Error("Nội dung file DOCX vượt quá giới hạn cho phép."));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", (error: Error) => reject(error));
  });
}

const HEADING_STYLE_LEVELS: Record<string, 1 | 2> = {
  Heading1: 1,
  Heading2: 2,
};

/** Recursively concatenates run text (w:t), tabs and line breaks, in document order. */
function extractParagraphText(node: XmlNode): string {
  let text = "";
  for (const [key, value] of Object.entries(node)) {
    if (key === ":@" || key === "w:pPr" || key === "w:rPr") continue;

    if (key === "w:t") {
      for (const child of Array.isArray(value) ? value : []) {
        if (child && typeof child === "object" && "#text" in (child as Record<string, unknown>)) {
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
        if (child && typeof child === "object") text += extractParagraphText(child as XmlNode);
      }
    }
  }
  return text;
}

function extractParagraphs(bodyChildren: XmlNode[]): { text: string; headingHint?: 1 | 2 }[] {
  const paragraphs: { text: string; headingHint?: 1 | 2 }[] = [];

  for (const node of bodyChildren) {
    if (!("w:p" in node)) continue; // tables, section properties, etc. are out of scope
    const children = childArray(node, "w:p");
    const pPr = findFirst(children, "w:pPr");
    let headingHint: 1 | 2 | undefined;
    if (pPr) {
      const pStyle = findFirst(childArray(pPr, "w:pPr"), "w:pStyle");
      const styleId = pStyle?.[":@"]?.["@_w:val"];
      if (typeof styleId === "string") headingHint = HEADING_STYLE_LEVELS[styleId];
    }
    paragraphs.push({ text: extractParagraphText(node).trim(), headingHint });
  }

  return paragraphs;
}

/**
 * Validates and extracts (text, heading-level) pairs from a DOCX buffer.
 * Everything a malicious .docx could do to hurt us happens here: this is
 * the only place that touches zip internals or XML.
 */
export async function extractDocxParagraphs(
  buffer: Buffer,
): Promise<{ text: string; headingHint?: 1 | 2 }[]> {
  if (!looksLikeZip(buffer)) {
    throw new Error("File không đúng định dạng DOCX (không phải file ZIP hợp lệ).");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("Không thể đọc file DOCX — file có thể bị hỏng.");
  }

  assertSafeEntryNames(zip);

  const contentTypes = await readZipEntry(zip, "[Content_Types].xml", MAX_ENTRY_BYTES);
  if (!contentTypes.includes("wordprocessingml")) {
    throw new Error("File không phải tài liệu Word (.docx) hợp lệ.");
  }

  const documentXml = await readZipEntry(zip, "word/document.xml", MAX_ENTRY_BYTES);

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
    throw new Error("File DOCX thiếu nội dung tài liệu (word/document.xml không hợp lệ).");
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
 * buildTextBlocks expects), and Heading 1/2-styled paragraphs are trusted
 * as section/chapter boundaries via LogicalLine.headingHint instead of
 * relying on text-pattern matching alone (see parseLogicalLines).
 */
export async function parseDocxDraft(
  buffer: Buffer,
  options: ParseStoryTextOptions = {},
): Promise<ImportDraft> {
  const paragraphs = await extractDocxParagraphs(buffer);

  const lines: LogicalLine[] = [];
  for (const paragraph of paragraphs) {
    paragraph.text.split("\n").forEach((segment, index) => {
      lines.push({ text: segment, headingHint: index === 0 ? paragraph.headingHint : undefined });
    });
    lines.push({ text: "" });
  }

  return parseLogicalLines(lines, { ...options, sourceType: "docx" });
}
