import { fingerprintParagraph } from "../reader/anchors";
import { normalizeSourceSegment, type DraftChapter, type DraftSection, type ImportDraft } from "./text-parser";

/**
 * A chapter from the story's current (live) tree, as it exists before this
 * re-import commits. sectionPath must be built the same way text-parser.ts
 * builds a new chapter's path (`${type}:${normalizeSourceSegment(title)}`
 * joined by "/", root first) so tier-2 matching compares like with like —
 * see buildSectionPaths below for the new-draft side of that convention.
 * first/lastParagraphFingerprint come from the chapter's current revision's
 * first/last content block, via fingerprintParagraph (lib/reader/anchors.ts)
 * — null only for a chapter with zero paragraph blocks, which shouldn't
 * normally occur (commit already rejects empty chapters) but is handled
 * defensively rather than assumed away.
 */
export type OldChapterRef = {
  id: string;
  sectionPath: string;
  title: string;
  sourceKey: string | null;
  sortOrder: number;
  firstParagraphFingerprint: string | null;
  lastParagraphFingerprint: string | null;
};

export type OldSectionRef = {
  id: string;
  parentSectionId: string | null;
  title: string;
  type: "volume" | "arc" | "part";
};

export type ChapterMatchTier = 1 | 2 | 3;

export type ChapterMatch = {
  newChapterId: string;
  oldChapterId: string;
  tier: ChapterMatchTier;
  reason: string;
};

export type SectionMatch = {
  newSectionId: string;
  oldSectionId: string;
};

export type ChapterMatchResult = {
  matches: ChapterMatch[];
  unmatchedOld: OldChapterRef[];
  unmatchedNew: DraftChapter[];
};

export type SectionMatchResult = {
  matches: SectionMatch[];
  unmatchedOld: OldSectionRef[];
};

type FlatNewChapter = { chapter: DraftChapter; sectionPath: string };

/**
 * Mirrors the `${type}:${normalizeSourceSegment(title)}` path convention
 * text-parser.ts's createSection builds inline during parsing (that logic
 * isn't exposed as a standalone function since it's entangled in the parse
 * loop) — kept in sync by construction: both use the same segment format
 * and normalizeSourceSegment.
 */
function buildSectionPaths(sections: DraftSection[]): Map<string, string> {
  const paths = new Map<string, string>();

  function walk(list: DraftSection[], parentPath: string | undefined) {
    for (const section of list) {
      const segment = `${section.type}:${normalizeSourceSegment(section.title)}`;
      const path = parentPath ? `${parentPath}/${segment}` : segment;
      paths.set(section.id, path);
      walk(section.children, path);
    }
  }

  walk(sections, undefined);
  return paths;
}

function flattenNewChapters(sections: DraftSection[]): FlatNewChapter[] {
  const paths = buildSectionPaths(sections);
  const result: FlatNewChapter[] = [];

  function walk(list: DraftSection[]) {
    for (const section of list) {
      const sectionPath = paths.get(section.id) ?? "unsectioned";
      for (const chapter of section.chapters) result.push({ chapter, sectionPath });
      walk(section.children);
    }
  }

  walk(sections);
  return result;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** Tier 1: exact source_key equality. */
function matchByTier1(oldRefs: OldChapterRef[], newFlat: FlatNewChapter[]): ChapterMatch[] {
  const matches: ChapterMatch[] = [];
  const usedOld = new Set<string>();

  for (const flat of newFlat) {
    const old = oldRefs.find(
      (ref) => !usedOld.has(ref.id) && ref.sourceKey && ref.sourceKey === flat.chapter.sourceKey,
    );
    if (old) {
      matches.push({
        newChapterId: flat.chapter.id,
        oldChapterId: old.id,
        tier: 1,
        reason: "Khớp chính xác theo source_key (đường dẫn hồi/phần + tiêu đề).",
      });
      usedOld.add(old.id);
    }
  }

  return matches;
}

/**
 * Tier 2: normalized title equal AND same section path, paired in
 * occurrence order within that (sectionPath, title) group — old chapters
 * ordered by sort_order, new chapters in parse order. This is deliberately
 * looser than tier 1: it doesn't require the "#N" occurrence-suffix or
 * `kind` to match, so a re-import that reorders same-titled chapters (which
 * shifts tier-1's occurrence suffix) can still resolve via title+position.
 */
function matchByTier2(oldRefs: OldChapterRef[], newFlat: FlatNewChapter[]): ChapterMatch[] {
  const keyOf = (sectionPath: string, title: string) => `${sectionPath}::${normalizeSourceSegment(title)}`;
  const oldGroups = groupBy(oldRefs, (ref) => keyOf(ref.sectionPath, ref.title));
  const newGroups = groupBy(newFlat, (flat) => keyOf(flat.sectionPath, flat.chapter.title));
  const matches: ChapterMatch[] = [];

  for (const [key, oldGroup] of oldGroups) {
    const newGroup = newGroups.get(key);
    if (!newGroup) continue;

    const orderedOld = [...oldGroup].sort((a, b) => a.sortOrder - b.sortOrder);
    const pairCount = Math.min(orderedOld.length, newGroup.length);
    for (let i = 0; i < pairCount; i += 1) {
      matches.push({
        newChapterId: newGroup[i].chapter.id,
        oldChapterId: orderedOld[i].id,
        tier: 2,
        reason: `Khớp theo tiêu đề "${orderedOld[i].title}" trùng vị trí trong cùng hồi/phần.`,
      });
    }
  }

  return matches;
}

function paragraphFingerprint(chapter: DraftChapter, edge: "first" | "last"): string | null {
  const block = edge === "first" ? chapter.blocks[0] : chapter.blocks.at(-1);
  return block ? fingerprintParagraph(block.text) : null;
}

/** Tier 3: first AND last paragraph fingerprints both match (title may have changed). */
function matchByTier3(oldRefs: OldChapterRef[], newFlat: FlatNewChapter[]): ChapterMatch[] {
  const matches: ChapterMatch[] = [];
  const usedOld = new Set<string>();

  for (const flat of newFlat) {
    const newFirst = paragraphFingerprint(flat.chapter, "first");
    const newLast = paragraphFingerprint(flat.chapter, "last");
    if (!newFirst || !newLast) continue;

    const old = oldRefs.find(
      (ref) =>
        !usedOld.has(ref.id) &&
        ref.firstParagraphFingerprint === newFirst &&
        ref.lastParagraphFingerprint === newLast,
    );
    if (old) {
      matches.push({
        newChapterId: flat.chapter.id,
        oldChapterId: old.id,
        tier: 3,
        reason: "Khớp theo đoạn văn đầu và cuối giống hệt (tiêu đề có thể đã đổi).",
      });
      usedOld.add(old.id);
    }
  }

  return matches;
}

/**
 * Runs the FR-07 auto-match cascade (source_key → title+position →
 * paragraph fingerprint → unmatched) in order, each tier only considering
 * chapters neither side has already matched. Pure and deterministic —
 * callers persist the accepted result (plus any manual overrides) into
 * import_jobs.mapping_json; the commit RPC re-validates injectivity
 * server-side rather than trusting that payload (see migration 0008).
 */
export function matchChapters(oldRefs: OldChapterRef[], newDraft: ImportDraft): ChapterMatchResult {
  const newFlat = flattenNewChapters(newDraft.sections);
  const matches: ChapterMatch[] = [];
  const matchedOldIds = new Set<string>();
  const matchedNewIds = new Set<string>();

  const tiers = [matchByTier1, matchByTier2, matchByTier3];
  for (const runTier of tiers) {
    const remainingOld = oldRefs.filter((ref) => !matchedOldIds.has(ref.id));
    const remainingNew = newFlat.filter((flat) => !matchedNewIds.has(flat.chapter.id));
    for (const match of runTier(remainingOld, remainingNew)) {
      if (matchedOldIds.has(match.oldChapterId) || matchedNewIds.has(match.newChapterId)) continue;
      matches.push(match);
      matchedOldIds.add(match.oldChapterId);
      matchedNewIds.add(match.newChapterId);
    }
  }

  return {
    matches,
    unmatchedOld: oldRefs.filter((ref) => !matchedOldIds.has(ref.id)),
    unmatchedNew: newFlat.filter((flat) => !matchedNewIds.has(flat.chapter.id)).map((flat) => flat.chapter),
  };
}

function buildOldSectionPaths(oldSections: OldSectionRef[]): Map<string, string> {
  const byId = new Map(oldSections.map((section) => [section.id, section]));
  const cache = new Map<string, string>();

  function pathOf(section: OldSectionRef): string {
    const cached = cache.get(section.id);
    if (cached) return cached;
    const segment = `${section.type}:${normalizeSourceSegment(section.title)}`;
    const parent = section.parentSectionId ? byId.get(section.parentSectionId) : undefined;
    const path = parent ? `${pathOf(parent)}/${segment}` : segment;
    cache.set(section.id, path);
    return path;
  }

  for (const section of oldSections) pathOf(section);
  return cache;
}

function collectNewSections(sections: DraftSection[]): DraftSection[] {
  return sections.flatMap((section) => [section, ...collectNewSections(section.children)]);
}

/**
 * Sections only get one match tier — exact normalized (type, title, parent
 * chain) path equality — per the scope cut in the Slice 3 plan: no
 * fuzzy/partial section matching. A renamed section is treated as new, and
 * the old one is archived by the commit RPC if it ends up with no active
 * chapters/children after commit.
 */
export function matchSections(oldSections: OldSectionRef[], newDraft: ImportDraft): SectionMatchResult {
  const oldPaths = buildOldSectionPaths(oldSections);
  const newPaths = buildSectionPaths(newDraft.sections);

  const oldByPath = new Map<string, OldSectionRef>();
  for (const section of oldSections) {
    const path = oldPaths.get(section.id)!;
    if (!oldByPath.has(path)) oldByPath.set(path, section);
  }

  const matches: SectionMatch[] = [];
  const matchedOldIds = new Set<string>();
  for (const section of collectNewSections(newDraft.sections)) {
    const path = newPaths.get(section.id)!;
    const old = oldByPath.get(path);
    if (old && !matchedOldIds.has(old.id)) {
      matches.push({ newSectionId: section.id, oldSectionId: old.id });
      matchedOldIds.add(old.id);
    }
  }

  return {
    matches,
    unmatchedOld: oldSections.filter((section) => !matchedOldIds.has(section.id)),
  };
}
