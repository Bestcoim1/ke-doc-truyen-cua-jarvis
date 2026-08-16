export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function normalizeRequiredText(
  value: FormDataEntryValue | null,
  maxLength: number,
) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) return null;
  return normalized;
}

export function normalizeOptionalText(
  value: FormDataEntryValue | null,
  maxLength: number,
) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
}

export function normalizeAliases(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(/[\n,;]+/u)) {
    const alias = part.trim();
    const key = alias.toLocaleLowerCase("vi");
    if (!alias || alias.length > 160 || seen.has(key)) continue;
    aliases.push(alias);
    seen.add(key);
    if (aliases.length === 30) break;
  }
  return aliases;
}

export type LineRangeResult =
  | { ok: true; startLine: number | null; endLine: number | null }
  | { ok: false };

export function parseLineRange(
  startValue: FormDataEntryValue | null,
  endValue: FormDataEntryValue | null,
): LineRangeResult {
  const startRaw = typeof startValue === "string" ? startValue.trim() : "";
  const endRaw = typeof endValue === "string" ? endValue.trim() : "";
  if (!startRaw && !endRaw) {
    return { ok: true, startLine: null, endLine: null };
  }

  const startLine = Number(startRaw);
  const endLine = Number(endRaw || startRaw);
  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    startLine <= 0 ||
    endLine < startLine
  ) {
    return { ok: false };
  }
  return { ok: true, startLine, endLine };
}

