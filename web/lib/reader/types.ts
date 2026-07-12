export type Block = {
  anchor_id: string;
  type: "paragraph" | "scene_break";
  text: string;
  marks: { type: "bold" | "italic"; start: number; end: number }[];
};

export type ChapterRevisionContent = {
  schema_version: 1;
  blocks: Block[];
};

export type FlatChapterEntry = {
  chapterId: string;
  chapterTitle: string;
  sectionId: string | null;
  sectionTitle: string | null;
  /** Full ancestor chain (root first, immediate parent last) — sectionTitle is sectionPath.at(-1). */
  sectionPath: string[];
  sortKey: number;
};

export type ReadState = "unread" | "reading" | "updated" | "completed";

export type ReadingSettings = {
  fontSizeStep: number;
  lineHeight: number;
  theme: "light" | "dark" | "sepia";
};

export const FONT_SIZE_STEPS = [16, 18, 20, 22] as const;
export const LINE_HEIGHT_STEPS = [1.5, 1.7, 2.0] as const;
