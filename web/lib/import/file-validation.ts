// Kept comfortably under next.config.ts's serverActions.bodySizeLimit
// (20mb) — that limit applies to the whole multipart request, not just this
// field, so this needs headroom rather than matching it exactly.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type UploadKind = "txt" | "docx";

const ZIP_LOCAL_FILE_MAGIC = [0x50, 0x4b, 0x03, 0x04];
// Empty/spanned archives use different signatures — accept them too so a
// legitimately-empty or multi-disk-flagged docx isn't rejected before we
// even try to read it; extraction below still fails cleanly if the parts
// we need aren't present.
const ZIP_EMPTY_MAGIC = [0x50, 0x4b, 0x05, 0x06];
const ZIP_SPANNED_MAGIC = [0x50, 0x4b, 0x07, 0x08];

function startsWithBytes(buffer: Buffer, magic: number[]): boolean {
  if (buffer.length < magic.length) return false;
  return magic.every((byte, index) => buffer[index] === byte);
}

export function looksLikeZip(buffer: Buffer): boolean {
  return (
    startsWithBytes(buffer, ZIP_LOCAL_FILE_MAGIC) ||
    startsWithBytes(buffer, ZIP_EMPTY_MAGIC) ||
    startsWithBytes(buffer, ZIP_SPANNED_MAGIC)
  );
}

/**
 * Extension is what decides which parser we invoke (txt vs docx) — this
 * exists purely to reject anything else early and to give a clear-error
 * failure mode instead of guessing.
 */
export function detectUploadKind(filename: string): UploadKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

/**
 * Strict UTF-8 decode — throws on any byte sequence that isn't valid UTF-8,
 * which is what "TXT UTF-8" as a supported format actually means (a file
 * that merely happens to open in some editor with mojibake is not
 * "supported", it's silently wrong). Also rejects NUL bytes, which never
 * appear in real UTF-8 text and are the cheapest signal that a binary file
 * was renamed to .txt.
 */
export function decodeStrictUtf8Text(buffer: Buffer): string {
  if (buffer.includes(0)) {
    throw new Error("File chứa byte NUL — không phải văn bản UTF-8 hợp lệ.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("File không phải văn bản UTF-8 hợp lệ.");
  }
}
