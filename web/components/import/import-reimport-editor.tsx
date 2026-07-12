"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CancelJobButton } from "@/components/import/cancel-job-button";
import { useDraftHistory } from "@/components/import/use-draft-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewReimportDraft } from "@/lib/import/reimport-actions";
import { computeFinalDecisions, type ManualOverride } from "@/lib/import/reimport-decisions";
import type { ChapterMatch, OldChapterRef, SectionMatch } from "@/lib/import/reimport-match";
import {
  changeSectionType,
  deleteChapter,
  flattenReviewChapters,
  flattenSectionOptions,
  mergeChapterWithPrevious,
  moveChapter,
  renameChapter,
  renameSection,
  reorderChapter,
  reorderSection,
  splitChapter,
  toStructure,
  type ReviewChapter,
  type ReviewDraft,
  type ReviewSection,
  type SectionOption,
} from "@/lib/import/review-draft";
import { buildTextBlocks, type DraftSectionType } from "@/lib/import/text-parser";

const INITIAL_STATE = { error: null, message: null };

const SECTION_TYPE_OPTIONS: { value: DraftSectionType; label: string; rootOnly?: boolean }[] = [
  { value: "volume", label: "Quyển / Volume", rootOnly: true },
  { value: "arc", label: "Hồi / Arc" },
  { value: "part", label: "Phần / Part" },
];

type MatchBadge = { reason: string; isManual: boolean };

type ChapterEditorProps = {
  chapter: ReviewChapter;
  sectionOptions: SectionOption[];
  currentSectionId: string;
  isFirst: boolean;
  isLast: boolean;
  canMerge: boolean;
  matchBadge: MatchBadge | undefined;
  onRename: (title: string) => void;
  onMove: (targetSectionId: string) => void;
  onMerge: () => void;
  onDelete: () => void;
  onReorder: (direction: "up" | "down") => void;
  onSplit: (blockIndex: number) => void;
};

function ChapterEditor({
  chapter,
  sectionOptions,
  currentSectionId,
  isFirst,
  isLast,
  canMerge,
  matchBadge,
  onRename,
  onMove,
  onMerge,
  onDelete,
  onReorder,
  onSplit,
}: ChapterEditorProps) {
  const [splitOpen, setSplitOpen] = useState(false);
  const blocks = useMemo(
    () => (splitOpen ? buildTextBlocks(chapter.contentText) : []),
    [splitOpen, chapter.contentText],
  );
  const isEmpty = !chapter.contentText.trim();

  return (
    <article className="rounded-lg border p-3" style={{ borderColor: "var(--kd-border)" }}>
      <label className="sr-only" htmlFor={`chapter-${chapter.id}`}>
        Tên chapter
      </label>
      <Input
        id={`chapter-${chapter.id}`}
        value={chapter.title}
        maxLength={200}
        onChange={(event) => onRename(event.target.value)}
        className="h-10"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span style={{ color: "var(--kd-text-muted)" }}>
          {chapter.wordCount.toLocaleString("vi-VN")} từ
        </span>
        {chapter.kind === "extra" ? <Badge variant="secondary">Ngoại truyện</Badge> : null}
        {isEmpty ? <Badge variant="destructive">Chapter rỗng</Badge> : null}
        {matchBadge ? (
          <Badge variant="outline">{matchBadge.isManual ? "Ánh xạ thủ công" : "Đã khớp"}</Badge>
        ) : (
          <Badge variant="secondary">Mới</Badge>
        )}
      </div>
      {matchBadge ? (
        <p className="mt-1 text-xs" style={{ color: "var(--kd-text-muted)" }}>
          {matchBadge.reason}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="grid gap-1 text-xs">
          <span style={{ color: "var(--kd-text-muted)" }}>Chuyển tới section</span>
          <select
            value={currentSectionId}
            onChange={(event) => onMove(event.target.value)}
            className="h-10 min-w-0 rounded-md border bg-transparent px-2 text-sm"
          >
            {sectionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {`${"— ".repeat(option.depth)}${option.title}`}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-end"
          disabled={!canMerge}
          onClick={onMerge}
        >
          Gộp với chương trước
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="self-end"
          onClick={onDelete}
        >
          Xóa chapter
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isFirst}
          onClick={() => onReorder("up")}
          aria-label="Chuyển chương lên trên"
        >
          ▲ Lên
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLast}
          onClick={() => onReorder("down")}
          aria-label="Chuyển chương xuống dưới"
        >
          ▼ Xuống
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSplitOpen((open) => !open)}>
          {splitOpen ? "Đóng tách chương" : "Tách chương"}
        </Button>
      </div>

      {splitOpen ? (
        <div
          className="mt-3 max-h-64 overflow-y-auto rounded-lg border p-2"
          style={{ borderColor: "var(--kd-border)" }}
        >
          {blocks.length < 2 ? (
            <p className="p-2 text-xs" style={{ color: "var(--kd-text-muted)" }}>
              Chương chỉ có một đoạn, không thể tách.
            </p>
          ) : (
            blocks.map((block, index) => (
              <div key={index}>
                {index > 0 ? (
                  <button
                    type="button"
                    className="my-1 w-full rounded border border-dashed py-1 text-center text-xs hover:bg-accent"
                    style={{ borderColor: "var(--kd-border)", color: "var(--kd-text-muted)" }}
                    onClick={() => {
                      onSplit(index);
                      setSplitOpen(false);
                    }}
                  >
                    Tách chương tại đây
                  </button>
                ) : null}
                <p className="truncate px-1 py-1 text-xs">
                  {block.type === "scene_break" ? `· ${block.text} ·` : block.text}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}

type SectionEditorProps = {
  section: ReviewSection;
  sectionOptions: SectionOption[];
  mergeableChapterIds: Set<string>;
  matchBadges: Map<string, MatchBadge>;
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  onRenameSection: (sectionId: string, title: string) => void;
  onChangeType: (sectionId: string, type: DraftSectionType) => void;
  onReorderSection: (sectionId: string, direction: "up" | "down") => void;
  onRenameChapter: (chapterId: string, title: string) => void;
  onMoveChapter: (chapterId: string, targetSectionId: string) => void;
  onMergeChapter: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onReorderChapter: (chapterId: string, direction: "up" | "down") => void;
  onSplitChapter: (chapterId: string, blockIndex: number) => void;
};

function SectionEditor({
  section,
  sectionOptions,
  mergeableChapterIds,
  matchBadges,
  depth,
  isFirst,
  isLast,
  onRenameSection,
  onChangeType,
  onReorderSection,
  onRenameChapter,
  onMoveChapter,
  onMergeChapter,
  onDeleteChapter,
  onReorderChapter,
  onSplitChapter,
}: SectionEditorProps) {
  return (
    <section
      className="rounded-xl border p-3 sm:p-4"
      style={{
        background: "var(--kd-surface)",
        borderColor: "var(--kd-border)",
        marginLeft: depth ? "0.75rem" : undefined,
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={section.type}
          onChange={(event) => onChangeType(section.id, event.target.value as DraftSectionType)}
          className="h-10 w-fit shrink-0 rounded-md border bg-transparent px-2 text-sm"
        >
          {SECTION_TYPE_OPTIONS.filter((option) => depth === 0 || !option.rootOnly).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`section-${section.id}`}>
          Tên section
        </label>
        <Input
          id={`section-${section.id}`}
          value={section.title}
          maxLength={200}
          onChange={(event) => onRenameSection(section.id, event.target.value)}
          className="h-10 flex-1 font-semibold"
        />
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isFirst}
            onClick={() => onReorderSection(section.id, "up")}
            aria-label="Chuyển section lên trên"
          >
            ▲
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isLast}
            onClick={() => onReorderSection(section.id, "down")}
            aria-label="Chuyển section xuống dưới"
          >
            ▼
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {section.chapters.map((chapter, index) => (
          <ChapterEditor
            key={chapter.id}
            chapter={chapter}
            sectionOptions={sectionOptions}
            currentSectionId={section.id}
            isFirst={index === 0}
            isLast={index === section.chapters.length - 1}
            canMerge={mergeableChapterIds.has(chapter.id)}
            matchBadge={matchBadges.get(chapter.id)}
            onRename={(title) => onRenameChapter(chapter.id, title)}
            onMove={(targetSectionId) => onMoveChapter(chapter.id, targetSectionId)}
            onMerge={() => onMergeChapter(chapter.id)}
            onDelete={() => onDeleteChapter(chapter.id)}
            onReorder={(direction) => onReorderChapter(chapter.id, direction)}
            onSplit={(blockIndex) => onSplitChapter(chapter.id, blockIndex)}
          />
        ))}
      </div>

      {section.children.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {section.children.map((child, index) => (
            <SectionEditor
              key={child.id}
              section={child}
              sectionOptions={sectionOptions}
              mergeableChapterIds={mergeableChapterIds}
              matchBadges={matchBadges}
              depth={depth + 1}
              isFirst={index === 0}
              isLast={index === section.children.length - 1}
              onRenameSection={onRenameSection}
              onChangeType={onChangeType}
              onReorderSection={onReorderSection}
              onRenameChapter={onRenameChapter}
              onMoveChapter={onMoveChapter}
              onMergeChapter={onMergeChapter}
              onDeleteChapter={onDeleteChapter}
              onReorderChapter={onReorderChapter}
              onSplitChapter={onSplitChapter}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ImportReimportEditor({
  jobId,
  initialDraft,
  autoMatches,
  oldChapters,
  sectionMatches,
  baseTreeToken,
  initialManualOverrides,
}: {
  jobId: string;
  initialDraft: ReviewDraft;
  autoMatches: ChapterMatch[];
  oldChapters: OldChapterRef[];
  sectionMatches: SectionMatch[];
  baseTreeToken: string;
  initialManualOverrides: Record<string, ManualOverride>;
}) {
  const { draft, pendingOps, canUndo, canRedo, apply, undo, redo, reset } =
    useDraftHistory(initialDraft);
  const [manualOverrides, setManualOverrides] =
    useState<Record<string, ManualOverride>>(initialManualOverrides);
  const [state, formAction, isPending] = useActionState(reviewReimportDraft, INITIAL_STATE);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  useEffect(() => {
    if (state.message) {
      reset(draftRef.current);
    }
  }, [state.message, reset]);

  const sectionOptions = useMemo(() => flattenSectionOptions(draft.sections), [draft.sections]);
  const flatChapters = useMemo(() => flattenReviewChapters(draft.sections), [draft.sections]);
  const mergeableChapterIds = useMemo(
    () => new Set(flatChapters.slice(1).map((entry) => entry.chapter.id)),
    [flatChapters],
  );
  const emptyChapters = useMemo(
    () => flatChapters.filter(({ chapter }) => !chapter.contentText.trim()),
    [flatChapters],
  );
  const currentNewChapterIds = useMemo(
    () => new Set(flatChapters.map((entry) => entry.chapter.id)),
    [flatChapters],
  );

  const { decisions, unresolvedOld } = useMemo(
    () => computeFinalDecisions(oldChapters, autoMatches, manualOverrides, currentNewChapterIds),
    [oldChapters, autoMatches, manualOverrides, currentNewChapterIds],
  );

  const matchBadges = useMemo(() => {
    const map = new Map<string, MatchBadge>();
    for (const decision of decisions) {
      if (decision.kind === "archived") continue;
      const auto = autoMatches.find(
        (match) => match.oldChapterId === decision.oldChapterId && match.newChapterId === decision.newChapterId,
      );
      // A later decision targeting the same chapter (a merge) doesn't
      // overwrite an already-set badge — the first (primary) claim wins,
      // which is fine since the badge only needs to say "this is matched".
      if (!map.has(decision.newChapterId)) {
        map.set(decision.newChapterId, auto ? { reason: auto.reason, isManual: false } : { reason: "Ánh xạ thủ công", isManual: true });
      }
    }
    return map;
  }, [decisions, autoMatches]);

  const manuallyDecidedOld = useMemo(
    () => oldChapters.filter((old) => manualOverrides[old.id] !== undefined),
    [oldChapters, manualOverrides],
  );

  const summary = useMemo(() => {
    const primaryCount = decisions.filter((d) => d.kind === "primary").length;
    const mergedCount = decisions.filter((d) => d.kind === "merged").length;
    const archivedCount = decisions.filter((d) => d.kind === "archived").length;
    const claimedNewChapterIds = new Set(
      decisions.filter((d) => d.kind === "primary").map((d) => d.newChapterId),
    );
    const newCount = currentNewChapterIds.size - claimedNewChapterIds.size;
    return { primaryCount, mergedCount, archivedCount, newCount };
  }, [decisions, currentNewChapterIds]);

  const structureJson = useMemo(() => JSON.stringify(toStructure(draft)), [draft]);
  const contentOpsJson = useMemo(() => JSON.stringify(pendingOps), [pendingOps]);
  const mappingJson = useMemo(
    () => JSON.stringify({ version: 1, baseTreeToken, decisions, sections: sectionMatches }),
    [baseTreeToken, decisions, sectionMatches],
  );

  const applyMerge = useCallback(
    (chapterId: string) => {
      const chapters = flattenReviewChapters(draft.sections);
      const index = chapters.findIndex((entry) => entry.chapter.id === chapterId);
      const previous = chapters[index - 1]?.chapter;
      if (!previous) return;
      apply(
        (current) => mergeChapterWithPrevious(current, chapterId),
        { type: "merge", keepChapterId: previous.id, mergedChapterId: chapterId },
      );
    },
    [draft.sections, apply],
  );

  const applySplit = useCallback(
    (chapterId: string, blockIndex: number) => {
      const newChapterId = `chapter-split-${crypto.randomUUID()}`;
      apply(
        (current) => splitChapter(current, chapterId, blockIndex, newChapterId),
        { type: "split", chapterId, blockIndex, newChapterId },
      );
    },
    [apply],
  );

  function setOverride(oldChapterId: string, override: ManualOverride) {
    setManualOverrides((prev) => ({ ...prev, [oldChapterId]: override }));
  }
  function clearOverride(oldChapterId: string) {
    setManualOverrides((prev) => {
      const next = { ...prev };
      delete next[oldChapterId];
      return next;
    });
  }

  // The form only wraps its hidden inputs — CancelJobButton (its own
  // <form>) sits among the visible content below, and nested <form>s are
  // invalid HTML (browsers silently mis-parse it, which showed up as a
  // React hydration error). Save/Commit reference this form by id via the
  // `form` attribute instead of physically nesting inside it.
  const formId = `reimport-review-form-${jobId}`;

  return (
    <div className="flex flex-col gap-6">
      <form id={formId} action={formAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="structure" value={structureJson} />
        <input type="hidden" name="contentOps" value={contentOpsJson} />
        <input type="hidden" name="mapping" value={mappingJson} />
      </form>

      <div>
        <p className="text-sm" style={{ color: "var(--kd-text-muted)" }}>
          So sánh bản cập nhật
        </p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{draft.title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canUndo} onClick={undo}>
          Hoàn tác
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canRedo} onClick={redo}>
          Làm lại
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Giữ nguyên ID", summary.primaryCount],
          ["Gộp vào chương khác", summary.mergedCount],
          ["Chương mới", summary.newCount],
          ["Lưu trữ", summary.archivedCount],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border p-3"
            style={{ background: "var(--kd-surface)", borderColor: "var(--kd-border)" }}
          >
            <dt className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
              {label}
            </dt>
            <dd className="mt-1 text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {unresolvedOld.length > 0 ? (
        <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <h2 className="font-semibold">
            {unresolvedOld.length} chương cũ cần xác nhận trước khi commit
          </h2>
          <p className="mt-1 text-sm">
            Các chương này không có trong bản thảo mới. Xác nhận lưu trữ (archive), hoặc ánh xạ
            vào một chương trong bản thảo mới nếu nó chỉ đổi tên/tách/gộp.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {unresolvedOld.map((old) => (
              <li
                key={old.id}
                className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-amber-950">{old.title}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) setOverride(old.id, { newChapterId: event.target.value });
                    }}
                    className="h-9 rounded-md border bg-white px-2 text-sm text-amber-950"
                  >
                    <option value="">Ánh xạ vào chương…</option>
                    {flatChapters.map(({ chapter }) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setOverride(old.id, { archived: true })}
                  >
                    Xác nhận đã bỏ
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {manuallyDecidedOld.length > 0 ? (
        <aside className="rounded-xl border p-4" style={{ borderColor: "var(--kd-border)" }}>
          <h2 className="text-sm font-semibold">Bạn đã chỉnh sửa thủ công</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {manuallyDecidedOld.map((old) => {
              const override = manualOverrides[old.id];
              const target =
                override && "newChapterId" in override
                  ? flatChapters.find((entry) => entry.chapter.id === override.newChapterId)?.chapter.title
                  : null;
              return (
                <li key={old.id} className="flex items-center justify-between gap-2">
                  <span>
                    {old.title} → {target ?? "Lưu trữ (archive)"}
                  </span>
                  <button
                    type="button"
                    className="text-xs underline"
                    style={{ color: "var(--kd-text-muted)" }}
                    onClick={() => clearOverride(old.id)}
                  >
                    Bỏ chọn
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      ) : null}

      <div className="flex flex-col gap-3">
        {draft.sections.map((section, index) => (
          <SectionEditor
            key={section.id}
            section={section}
            sectionOptions={sectionOptions}
            mergeableChapterIds={mergeableChapterIds}
            matchBadges={matchBadges}
            depth={0}
            isFirst={index === 0}
            isLast={index === draft.sections.length - 1}
            onRenameSection={(sectionId, title) =>
              apply((current) => renameSection(current, sectionId, title))
            }
            onChangeType={(sectionId, type) =>
              apply((current) => changeSectionType(current, sectionId, type))
            }
            onReorderSection={(sectionId, direction) =>
              apply((current) => reorderSection(current, sectionId, direction))
            }
            onRenameChapter={(chapterId, title) =>
              apply((current) => renameChapter(current, chapterId, title))
            }
            onMoveChapter={(chapterId, targetSectionId) =>
              apply((current) => moveChapter(current, chapterId, targetSectionId))
            }
            onMergeChapter={applyMerge}
            onDeleteChapter={(chapterId) => apply((current) => deleteChapter(current, chapterId))}
            onReorderChapter={(chapterId, direction) =>
              apply((current) => reorderChapter(current, chapterId, direction))
            }
            onSplitChapter={applySplit}
          />
        ))}
      </div>

      {draft.stats.chapterCount === 0 ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Cần giữ lại ít nhất một chapter để commit.
        </p>
      ) : null}
      {emptyChapters.length > 0 ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Còn {emptyChapters.length} chapter rỗng (
          {emptyChapters.map(({ chapter }) => chapter.title).join(", ")}) — xóa hoặc gộp trước
          khi commit.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          {state.message}
        </p>
      ) : null}

      <div
        className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:rounded-xl sm:border"
        style={{ background: "color-mix(in srgb, var(--kd-bg) 92%, transparent)" }}
      >
        <CancelJobButton jobId={jobId} />
        <Button asChild type="button" variant="ghost">
          <Link href="/library">Về thư viện</Link>
        </Button>
        <Button type="submit" form={formId} name="intent" value="save" variant="outline" disabled={isPending}>
          {isPending ? "Đang xử lý…" : "Lưu bản nháp"}
        </Button>
        <Button
          type="submit"
          form={formId}
          name="intent"
          value="commit"
          disabled={
            isPending ||
            draft.stats.chapterCount === 0 ||
            emptyChapters.length > 0 ||
            unresolvedOld.length > 0
          }
        >
          {isPending ? "Đang xử lý…" : "Commit vào kệ đọc"}
        </Button>
      </div>
    </div>
  );
}
