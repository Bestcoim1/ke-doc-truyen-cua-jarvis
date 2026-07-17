export const REIMPORT_MODES = ["append", "update"] as const;

export type ReimportMode = (typeof REIMPORT_MODES)[number];

export function parseReimportMode(value: unknown): ReimportMode {
  return value === "update" ? "update" : "append";
}

export function reimportModeFromMapping(mapping: unknown): ReimportMode {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return "update";
  }
  const mode = (mapping as { mode?: unknown }).mode;
  return mode === undefined ? "update" : parseReimportMode(mode);
}
