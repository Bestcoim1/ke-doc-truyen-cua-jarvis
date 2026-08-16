import {
  retargetAppendDraft,
  type ExistingAppendSection,
} from "./append-target";
import type { ManualOverride } from "./reimport-decisions";
import type { OldChapterRef, OldSectionRef, SectionMatch } from "./reimport-match";
import {
  buildImportedStory,
  type DraftChapter,
  type ImportDraft,
} from "./text-parser";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type ReimportUpdateScope =
  | { kind: "story" }
  | { kind: "section"; targetId: string }
  | { kind: "chapter"; targetId: string };

export type LoadedUpdateTarget =
  | { kind: "story"; scope: { kind: "story" } }
  | {
      kind: "section";
      scope: { kind: "section"; targetId: string };
      path: ExistingAppendSection[];
    }
  | {
      kind: "chapter";
      scope: { kind: "chapter"; targetId: string };
      path: ExistingAppendSection[];
      chapter: Pick<DraftChapter, "title" | "kind"> & {
        sourceKey: string | null;
      };
    };

export function parseReimportUpdateScope(
  kind: unknown,
  targetId: unknown,
): ReimportUpdateScope {
  if (kind === "story") return { kind: "story" };
  if (
    (kind === "section" || kind === "chapter") &&
    typeof targetId === "string" &&
    UUID_RE.test(targetId)
  ) {
    return { kind, targetId };
  }
  throw new Error("Hãy chọn chương, hồi hoặc arc cần cập nhật.");
}

export function reimportUpdateScopeFromMapping(
  mapping: unknown,
): ReimportUpdateScope {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return { kind: "story" };
  }
  const scope = (mapping as { scope?: unknown }).scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    return { kind: "story" };
  }
  const record = scope as { kind?: unknown; targetId?: unknown };
  try {
    return parseReimportUpdateScope(record.kind, record.targetId);
  } catch {
    return { kind: "story" };
  }
}

export function sameReimportUpdateScope(
  left: ReimportUpdateScope,
  right: ReimportUpdateScope,
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === "story" ||
      (right.kind !== "story" && left.targetId === right.targetId))
  );
}

function collectChapters(draft: ImportDraft): DraftChapter[] {
  function walk(sections: ImportDraft["sections"]): DraftChapter[] {
    return sections.flatMap((section) => [
      ...section.chapters,
      ...walk(section.children),
    ]);
  }
  return walk(draft.sections);
}

export function collectDraftChapterIds(draft: ImportDraft): string[] {
  return collectChapters(draft).map((chapter) => chapter.id);
}

export function prepareScopedUpdateDraft(
  draft: ImportDraft,
  target: LoadedUpdateTarget,
): {
  draft: ImportDraft;
  sectionMatches: SectionMatch[];
  scope: ReimportUpdateScope;
} {
  if (target.kind === "story") {
    return { draft, sectionMatches: [], scope: target.scope };
  }

  if (target.kind === "chapter") {
    const chapters = collectChapters(draft);
    if (chapters.length !== 1) {
      throw new Error(
        `Bạn đang cập nhật một chương, nhưng bản thảo chứa ${chapters.length} chương. Hãy chỉ giữ nội dung của đúng chương đã chọn.`,
      );
    }

    const retargeted = retargetAppendDraft(draft, target.path);
    const leaf =
      target.path.length === 1
        ? retargeted.draft.sections[0]
        : retargeted.draft.sections[0]?.children[0];
    if (!leaf || leaf.chapters.length !== 1) {
      throw new Error("Không thể đặt chương vào đúng phân hồi đã chọn.");
    }
    const selectedChapter = leaf.chapters[0];
    leaf.chapters = [
      {
        ...selectedChapter,
        title: target.chapter.title,
        kind: target.chapter.kind,
        sourceKey: target.chapter.sourceKey ?? selectedChapter.sourceKey,
      },
    ];

    return {
      draft: buildImportedStory({
        title: retargeted.draft.title,
        description: retargeted.draft.description,
        sourceType: retargeted.draft.sourceType,
        sections: retargeted.draft.sections,
        warnings: retargeted.draft.warnings,
      }),
      sectionMatches: retargeted.sectionMatches,
      scope: target.scope,
    };
  }

  if (target.path.length > 1) {
    const retargeted = retargetAppendDraft(draft, target.path);
    return {
      draft: retargeted.draft,
      sectionMatches: retargeted.sectionMatches,
      scope: target.scope,
    };
  }

  if (draft.sections.length !== 1) {
    throw new Error(
      "Khi cập nhật một arc hoặc hồi cấp gốc, bản thảo cần có đúng một section cấp gốc.",
    );
  }
  const currentTarget = target.path[0];
  const root = {
    ...draft.sections[0],
    id: crypto.randomUUID(),
    title: currentTarget.title,
    type: currentTarget.type,
  };
  const scopedDraft = buildImportedStory({
    title: draft.title,
    description: draft.description,
    sourceType: draft.sourceType,
    sections: [root],
    warnings: draft.warnings,
  });
  return {
    draft: scopedDraft,
    sectionMatches: [
      { newSectionId: root.id, oldSectionId: currentTarget.id },
    ],
    scope: target.scope,
  };
}

export function oldChapterIdsInScope(
  scope: ReimportUpdateScope,
  oldChapters: OldChapterRef[],
  oldSections: OldSectionRef[],
): Set<string> {
  if (scope.kind === "story") {
    return new Set(oldChapters.map((chapter) => chapter.id));
  }
  if (scope.kind === "chapter") return new Set([scope.targetId]);

  const scopedSectionIds = new Set([scope.targetId]);
  let added = true;
  while (added) {
    added = false;
    for (const section of oldSections) {
      if (
        section.parentSectionId &&
        scopedSectionIds.has(section.parentSectionId) &&
        !scopedSectionIds.has(section.id)
      ) {
        scopedSectionIds.add(section.id);
        added = true;
      }
    }
  }
  return new Set(
    oldChapters
      .filter(
        (chapter) =>
          chapter.sectionId !== null && scopedSectionIds.has(chapter.sectionId),
      )
      .map((chapter) => chapter.id),
  );
}

export function buildScopedInitialOverrides(
  scope: ReimportUpdateScope,
  oldChapters: OldChapterRef[],
  oldSections: OldSectionRef[],
  newChapterIds: string[],
): Record<string, ManualOverride> {
  if (scope.kind === "story") return {};

  const inScope = oldChapterIdsInScope(scope, oldChapters, oldSections);
  const overrides: Record<string, ManualOverride> = Object.fromEntries(
    oldChapters
      .filter((chapter) => !inScope.has(chapter.id))
      .map((chapter) => [chapter.id, { unrelated: true as const }]),
  );

  if (scope.kind === "chapter" && newChapterIds[0]) {
    overrides[scope.targetId] = { newChapterId: newChapterIds[0] };
  }
  return overrides;
}
