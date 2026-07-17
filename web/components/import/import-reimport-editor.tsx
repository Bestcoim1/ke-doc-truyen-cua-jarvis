"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  MoreHorizontal,
} from "lucide-react";

import { CancelJobButton } from "@/components/import/cancel-job-button";
import { useDraftHistory } from "@/components/import/use-draft-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reviewReimportDraft } from "@/lib/import/reimport-actions";
import {
  computeFinalDecisions,
  type ManualOverride,
} from "@/lib/import/reimport-decisions";
import type {
  ChapterMatch,
  OldChapterRef,
  SectionMatch,
} from "@/lib/import/reimport-match";
import type { ReimportMode } from "@/lib/import/reimport-mode";
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
import {
  buildTextBlocks,
  type DraftSectionType,
} from "@/lib/import/text-parser";

const INITIAL_STATE = { error: null, message: null };

const SECTION_TYPE_OPTIONS: {
  value: DraftSectionType;
  label: string;
  rootOnly?: boolean;
}[] = [
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
    () => buildTextBlocks(chapter.contentText),
    [chapter.contentText],
  );
  const isEmpty = !chapter.contentText.trim();

  return (
    <article
      className="rounded-lg border p-4 sm:p-6"
      style={{
        borderColor: "var(--kd-border)",
        background: "var(--kd-surface)",
      }}
    >
      <label
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: "var(--kd-text-muted)" }}
      >
        Tên chapter
      </label>
      <Input
        id={`chapter-${chapter.id}`}
        value={chapter.title}
        maxLength={200}
        onChange={(event) => onRename(event.target.value)}
        className="mt-2 h-10 font-bold"
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span style={{ color: "var(--kd-text-muted)" }}>
          {chapter.wordCount.toLocaleString("vi-VN")} từ
        </span>
        {chapter.kind === "extra" ? (
          <Badge variant="secondary">Ngoại truyện</Badge>
        ) : null}
        {isEmpty ? <Badge variant="destructive">Chapter rỗng</Badge> : null}
        {matchBadge ? (
          <Badge variant="outline">
            {matchBadge.isManual ? "Ánh xạ thủ công" : "Đã khớp"}
          </Badge>
        ) : (
          <Badge variant="secondary">Mới</Badge>
        )}
      </div>
      {matchBadge ? (
        <p className="mt-1 text-xs" style={{ color: "var(--kd-text-muted)" }}>
          {matchBadge.reason}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs">
          <span style={{ color: "var(--kd-text-muted)" }}>Thuộc section</span>
          <select
            value={currentSectionId}
            onChange={(event) => onMove(event.target.value)}
            className="h-10 min-w-0 rounded-md border bg-transparent px-3 text-sm"
          >
            {sectionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {`${"— ".repeat(option.depth)}${option.title}`}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5 justify-end">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={isFirst}
              onClick={() => onReorder("up")}
            >
              ▲ Lên
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={isLast}
              onClick={() => onReorder("down")}
            >
              ▼ Xuống
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canMerge}
          onClick={onMerge}
        >
          Gộp với chương trước
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSplitOpen((open) => !open)}
        >
          {splitOpen ? "Đóng tách chương" : "Tách chương"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
        >
          Xóa chapter
        </Button>
      </div>

      <div
        className="mt-6 border-t pt-4"
        style={{ borderColor: "var(--kd-border)" }}
      >
        <h3
          className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: "var(--kd-text-muted)" }}
        >
          Nội dung
        </h3>
        <div
          className="max-h-96 overflow-y-auto rounded-lg border p-3 font-serif text-sm leading-relaxed"
          style={{
            borderColor: "var(--kd-border)",
            background: "var(--kd-bg)",
          }}
        >
          {blocks.length === 0 ? (
            <p
              className="p-2 text-xs italic"
              style={{ color: "var(--kd-text-muted)" }}
            >
              Không có nội dung.
            </p>
          ) : (
            blocks.map((block, index) => (
              <div key={index}>
                {splitOpen && index > 0 ? (
                  <button
                    type="button"
                    className="my-2 w-full rounded border border-dashed py-1.5 text-center text-xs hover:bg-accent font-sans"
                    style={{
                      borderColor: "var(--kd-border)",
                      color: "var(--kd-text-muted)",
                    }}
                    onClick={() => {
                      onSplit(index);
                      setSplitOpen(false);
                    }}
                  >
                    Tách chương tại đây
                  </button>
                ) : null}
                <p
                  className={`px-1 py-1 ${block.type === "scene_break" ? "text-center" : ""}`}
                >
                  {block.type === "scene_break"
                    ? `· ${block.text} ·`
                    : block.text}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  );
}

type SectionEditorProps = {
  section: ReviewSection;
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  onRenameSection: (title: string) => void;
  onChangeType: (type: DraftSectionType) => void;
  onReorderSection: (direction: "up" | "down") => void;
};

function SectionEditor({
  section,
  depth,
  isFirst,
  isLast,
  onRenameSection,
  onChangeType,
  onReorderSection,
}: SectionEditorProps) {
  return (
    <section
      className="rounded-lg border p-4 sm:p-6"
      style={{
        background: "var(--kd-surface)",
        borderColor: "var(--kd-border)",
      }}
    >
      <label
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: "var(--kd-text-muted)" }}
      >
        Tên section
      </label>
      <Input
        id={`section-${section.id}`}
        value={section.title}
        maxLength={200}
        onChange={(event) => onRenameSection(event.target.value)}
        className="mt-2 h-10 font-bold"
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs">
          <span style={{ color: "var(--kd-text-muted)" }}>Loại section</span>
          <select
            value={section.type}
            onChange={(event) =>
              onChangeType(event.target.value as DraftSectionType)
            }
            className="h-10 min-w-0 rounded-md border bg-transparent px-3 text-sm"
          >
            {SECTION_TYPE_OPTIONS.filter(
              (option) => depth === 0 || !option.rootOnly,
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5 justify-end">
          <span className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            Sắp xếp
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={isFirst}
              onClick={() => onReorderSection("up")}
            >
              ▲ Lên
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={isLast}
              onClick={() => onReorderSection("down")}
            >
              ▼ Xuống
            </Button>
          </div>
        </div>
      </div>

      <div
        className="mt-4 flex flex-wrap gap-2 text-xs"
        style={{ color: "var(--kd-text-muted)" }}
      >
        <span>
          Bao gồm {section.chapters.length} chương trực tiếp và{" "}
          {section.children.length} section con.
        </span>
      </div>
    </section>
  );
}

function OutlineNode({
  node,
  selectedId,
  onSelect,
  isChapter = false,
  matchBadge,
}: {
  node: ReviewSection | ReviewChapter;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isChapter?: boolean;
  matchBadge?: MatchBadge | undefined;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = node.id === selectedId;
  const hasChildren =
    !isChapter &&
    "children" in node &&
    (node.children.length > 0 || node.chapters.length > 0);

  return (
    <div className="outline-node">
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${isSelected ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50"}`}
        onClick={() => onSelect(node.id)}
      >
        <div
          className="w-4 h-4 flex shrink-0 items-center justify-center cursor-pointer opacity-70 hover:opacity-100"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setExpanded(!expanded);
            }
          }}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : null}
        </div>

        {isChapter ? (
          <FileText size={14} className="shrink-0 opacity-60" />
        ) : (
          <Folder size={14} className="shrink-0 opacity-60" />
        )}

        <span className="truncate flex-1">
          {node.title || (isChapter ? "Chương rỗng" : "Section rỗng")}
        </span>

        {isChapter ? (
          <>
            {matchBadge ? null : (
              <span
                className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                title="Chương mới"
              />
            )}
            {"contentText" in node && !node.contentText.trim() ? (
              <div
                className="w-2 h-2 rounded-full bg-destructive shrink-0"
                title="Chương rỗng"
              />
            ) : null}
          </>
        ) : null}
      </div>

      {hasChildren && expanded && !isChapter && "children" in node && (
        <div className="ml-4 pl-2 border-l border-border mt-1 space-y-0.5">
          {node.chapters.map((ch) => (
            <OutlineNode
              key={ch.id}
              node={ch}
              selectedId={selectedId}
              onSelect={onSelect}
              isChapter
            />
          ))}
          {node.children.map((sec) => (
            <OutlineNode
              key={sec.id}
              node={sec}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ImportReimportEditor({
  jobId,
  oldChapters,
  baseTreeToken,
  autoMatches,
  sectionMatches,
  initialDraft,
  initialManualOverrides,
  mode,
}: {
  jobId: string;
  oldChapters: OldChapterRef[];
  baseTreeToken: string;
  autoMatches: ChapterMatch[];
  sectionMatches: SectionMatch[];
  initialDraft: ReviewDraft;
  initialManualOverrides?: Record<string, ManualOverride>;
  mode: ReimportMode;
}) {
  const { draft, pendingOps, canUndo, canRedo, apply, undo, redo, reset } =
    useDraftHistory(initialDraft);
  const [state, formAction, isPending] = useActionState(
    reviewReimportDraft,
    INITIAL_STATE,
  );
  const [manualOverrides, setManualOverrides] = useState<
    Record<string, ManualOverride>
  >(initialManualOverrides || {});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && draft.sections.length > 0) {
      const firstChapter = flattenReviewChapters(draft.sections)[0]?.chapter;
      if (firstChapter) {
        setSelectedId(firstChapter.id);
      } else {
        setSelectedId(draft.sections[0].id);
      }
    }
  }, [draft.sections, selectedId]);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  useEffect(() => {
    if (state.message) {
      reset(draftRef.current);
    }
  }, [state.message, reset]);

  const sectionOptions = useMemo(
    () => flattenSectionOptions(draft.sections),
    [draft.sections],
  );
  const flatChapters = useMemo(
    () => flattenReviewChapters(draft.sections),
    [draft.sections],
  );
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
    () =>
      computeFinalDecisions(
        oldChapters,
        autoMatches,
        manualOverrides,
        currentNewChapterIds,
      ),
    [oldChapters, autoMatches, manualOverrides, currentNewChapterIds],
  );

  const matchBadges = useMemo(() => {
    const map = new Map<string, MatchBadge>();
    for (const decision of decisions) {
      if (decision.kind === "archived" || decision.kind === "unrelated")
        continue;
      const auto = autoMatches.find(
        (match) =>
          match.oldChapterId === decision.oldChapterId &&
          match.newChapterId === decision.newChapterId,
      );
      if (!map.has(decision.newChapterId)) {
        map.set(
          decision.newChapterId,
          auto
            ? { reason: auto.reason, isManual: false }
            : { reason: "Ánh xạ thủ công", isManual: true },
        );
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
    const unrelatedCount = decisions.filter(
      (d) => d.kind === "unrelated",
    ).length;
    const claimedNewChapterIds = new Set(
      decisions.filter((d) => d.kind === "primary").map((d) => d.newChapterId),
    );
    const newCount = currentNewChapterIds.size - claimedNewChapterIds.size;
    return {
      primaryCount,
      mergedCount,
      archivedCount,
      unrelatedCount,
      newCount,
    };
  }, [decisions, currentNewChapterIds]);

  const selectedNodeInfo = useMemo(() => {
    if (!selectedId) return null;

    type NodeInfo =
      | {
          type: "section";
          section: ReviewSection;
          isFirst: boolean;
          isLast: boolean;
          depth: number;
        }
      | {
          type: "chapter";
          chapter: ReviewChapter;
          sectionId: string;
          isFirst: boolean;
          isLast: boolean;
        }
      | null;

    function traverse(
      sections: ReviewSection[],
      currentDepth: number,
    ): NodeInfo {
      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        if (sec.id === selectedId) {
          return {
            type: "section" as const,
            section: sec,
            isFirst: i === 0,
            isLast: i === sections.length - 1,
            depth: currentDepth,
          };
        }
        for (let j = 0; j < sec.chapters.length; j++) {
          const ch = sec.chapters[j];
          if (ch.id === selectedId) {
            return {
              type: "chapter" as const,
              chapter: ch,
              sectionId: sec.id,
              isFirst: j === 0,
              isLast: j === sec.chapters.length - 1,
            };
          }
        }
        const found = traverse(sec.children, currentDepth + 1);
        if (found) return found;
      }
      return null;
    }

    return traverse(draft.sections, 0);
  }, [draft.sections, selectedId]);

  const structureJson = useMemo(
    () => JSON.stringify(toStructure(draft)),
    [draft],
  );
  const contentOpsJson = useMemo(
    () => JSON.stringify(pendingOps),
    [pendingOps],
  );
  const mappingJson = useMemo(
    () =>
      JSON.stringify({
        version: 1,
        mode,
        baseTreeToken,
        decisions,
        sections: sectionMatches,
      }),
    [baseTreeToken, decisions, mode, sectionMatches],
  );

  const applyMerge = useCallback(
    (chapterId: string) => {
      const chapters = flattenReviewChapters(draft.sections);
      const index = chapters.findIndex(
        (entry) => entry.chapter.id === chapterId,
      );
      const previous = chapters[index - 1]?.chapter;
      if (!previous) return;
      apply((current) => mergeChapterWithPrevious(current, chapterId), {
        type: "merge",
        keepChapterId: previous.id,
        mergedChapterId: chapterId,
      });
      setSelectedId(previous.id);
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

  const formId = `reimport-review-form-${jobId}`;

  // Inside outline tree, chapters use matchBadge:
  // So we override OutlineNode's rendering slightly if we had to pass matchBadge down,
  // but OutlineNode is shared. To simplify, we can just inline or pass matchBadges to OutlineNode.
  function CustomOutlineNode({
    node,
    isChapter = false,
  }: {
    node: ReviewSection | ReviewChapter;
    isChapter?: boolean;
  }) {
    const [expanded, setExpanded] = useState(true);
    const isSelected = node.id === selectedId;
    const hasChildren =
      !isChapter &&
      "children" in node &&
      (node.children.length > 0 || node.chapters.length > 0);
    const badge = isChapter ? matchBadges.get(node.id) : undefined;

    return (
      <div className="outline-node">
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${isSelected ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50"}`}
          onClick={() => setSelectedId(node.id)}
        >
          <div
            className="w-4 h-4 flex shrink-0 items-center justify-center cursor-pointer opacity-70 hover:opacity-100"
            onClick={(e) => {
              if (hasChildren) {
                e.stopPropagation();
                setExpanded(!expanded);
              }
            }}
          >
            {hasChildren ? (
              expanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : null}
          </div>

          {isChapter ? (
            <FileText size={14} className="shrink-0 opacity-60" />
          ) : (
            <Folder size={14} className="shrink-0 opacity-60" />
          )}

          <span className="truncate flex-1">
            {node.title || (isChapter ? "Chương rỗng" : "Section rỗng")}
          </span>

          {isChapter ? (
            <>
              {badge ? null : (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                  title="Chương mới"
                />
              )}
              {"contentText" in node && !node.contentText.trim() ? (
                <div
                  className="w-2 h-2 rounded-full bg-destructive shrink-0"
                  title="Chương rỗng"
                />
              ) : null}
            </>
          ) : null}
        </div>

        {hasChildren && expanded && !isChapter && "children" in node && (
          <div className="ml-4 pl-2 border-l border-border mt-1 space-y-0.5">
            {node.chapters.map((ch) => (
              <CustomOutlineNode key={ch.id} node={ch} isChapter />
            ))}
            {node.children.map((sec) => (
              <CustomOutlineNode key={sec.id} node={sec} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-140px)]">
      <form id={formId} action={formAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="structure" value={structureJson} />
        <input type="hidden" name="contentOps" value={contentOpsJson} />
        <input type="hidden" name="mapping" value={mappingJson} />
      </form>

      {/* Header Info */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl font-display">
            {draft.title}
          </h1>
          <div
            className="mt-1 flex items-center gap-3 text-sm"
            style={{ color: "var(--kd-text-muted)" }}
          >
            <span>{draft.stats.sectionCount} Section</span>
            <span>•</span>
            <span>{draft.stats.chapterCount} Chương</span>
            <span>•</span>
            <span>{draft.stats.wordCount.toLocaleString("vi-VN")} Từ</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canUndo}
            onClick={undo}
          >
            Hoàn tác
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canRedo}
            onClick={redo}
          >
            Làm lại
          </Button>
        </div>
      </div>

      {/* Summary Badges */}
      <div
        className={`flex-shrink-0 grid grid-cols-2 gap-2 text-center ${
          mode === "append" ? "sm:grid-cols-2" : "sm:grid-cols-5"
        }`}
      >
        {(mode === "append"
          ? [
              ["Chương hiện có được giữ nguyên", oldChapters.length],
              ["Chương mới sẽ nối tiếp", currentNewChapterIds.size],
            ]
          : [
              ["Giữ nguyên", summary.primaryCount],
              ["Gộp", summary.mergedCount],
              ["Mới", summary.newCount],
              ["Lưu trữ", summary.archivedCount],
              ["Không l.quan", summary.unrelatedCount],
            ]
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border p-2"
            style={{
              background: "var(--kd-surface)",
              borderColor: "var(--kd-border)",
            }}
          >
            <div
              className="text-[10px] uppercase font-bold"
              style={{ color: "var(--kd-text-muted)" }}
            >
              {label}
            </div>
            <div className="font-bold">{value}</div>
          </div>
        ))}
      </div>

      {mode === "append" ? (
        <p
          className="flex-shrink-0 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--kd-border)",
            background: "var(--kd-surface)",
            color: "var(--kd-text-muted)",
          }}
        >
          Chế độ nối tiếp: chỉ các chương trong bản review bên dưới được thêm
          vào cuối tác phẩm. Các chương hiện có không bị ánh xạ, sửa hoặc lưu trữ.
        </p>
      ) : null}

      {unresolvedOld.length > 0 ||
      emptyChapters.length > 0 ||
      state.error ||
      draft.stats.chapterCount === 0 ? (
        <div className="flex-shrink-0 space-y-2 max-h-48 overflow-y-auto">
          {unresolvedOld.length > 0 ? (
            <aside className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <h2 className="font-semibold text-sm">
                {unresolvedOld.length} chương cũ cần xác nhận
              </h2>
              <ul className="mt-2 flex flex-col gap-2">
                {unresolvedOld.map((old) => (
                  <li
                    key={old.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs"
                  >
                    <span className="font-medium text-amber-950">
                      {old.title}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          if (event.target.value)
                            setOverride(old.id, {
                              newChapterId: event.target.value,
                            });
                        }}
                        className="h-8 rounded-md border bg-white px-2"
                      >
                        <option value="">Ánh xạ vào…</option>
                        {flatChapters.map(({ chapter }) => (
                          <option key={chapter.id} value={chapter.id}>
                            {chapter.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setOverride(old.id, { unrelated: true })}
                      >
                        Không l.quan
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setOverride(old.id, { archived: true })}
                      >
                        Bỏ
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          {mode === "update" && manuallyDecidedOld.length > 0 ? (
            <aside
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--kd-border)" }}
            >
              <h2 className="text-xs font-semibold">
                Chỉnh sửa thủ công ({manuallyDecidedOld.length})
              </h2>
              <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {manuallyDecidedOld.map((old) => {
                  const override = manualOverrides[old.id];
                  const target =
                    override && "newChapterId" in override
                      ? flatChapters.find(
                          (entry) => entry.chapter.id === override.newChapterId,
                        )?.chapter.title
                      : null;
                  const label =
                    target ??
                    (override && "unrelated" in override
                      ? "Không liên quan"
                      : "Lưu trữ");
                  return (
                    <li
                      key={old.id}
                      className="flex items-center justify-between gap-2 p-1.5 rounded bg-accent/30"
                    >
                      <span className="truncate">
                        {old.title} → {label}
                      </span>
                      <button
                        type="button"
                        className="underline shrink-0"
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

          {draft.stats.chapterCount === 0 ? (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700"
            >
              Cần giữ lại ít nhất một chapter để commit.
            </p>
          ) : null}
          {emptyChapters.length > 0 ? (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700"
            >
              Còn {emptyChapters.length} chapter rỗng — xóa hoặc gộp trước khi
              commit.
            </p>
          ) : null}
          {state.error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700"
            >
              {state.error}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Main 2-column layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Left Column: Outline Tree */}
        <div
          className="rounded-xl border flex flex-col min-h-0 bg-background"
          style={{ borderColor: "var(--kd-border)" }}
        >
          <div
            className="p-3 border-b text-sm font-semibold flex items-center justify-between"
            style={{
              borderColor: "var(--kd-border)",
              background: "var(--kd-surface)",
            }}
          >
            <span>Cấu trúc truyện</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {draft.sections.map((sec) => (
              <CustomOutlineNode key={sec.id} node={sec} />
            ))}
          </div>
        </div>

        {/* Right Column: Detail View */}
        <div className="rounded-xl min-h-0 overflow-y-auto">
          {selectedNodeInfo ? (
            selectedNodeInfo.type === "chapter" ? (
              <ChapterEditor
                chapter={selectedNodeInfo.chapter}
                sectionOptions={sectionOptions}
                currentSectionId={selectedNodeInfo.sectionId}
                isFirst={selectedNodeInfo.isFirst}
                isLast={selectedNodeInfo.isLast}
                canMerge={mergeableChapterIds.has(selectedNodeInfo.chapter.id)}
                matchBadge={matchBadges.get(selectedNodeInfo.chapter.id)}
                onRename={(title) =>
                  apply((current) =>
                    renameChapter(current, selectedNodeInfo.chapter.id, title),
                  )
                }
                onMove={(targetSectionId) =>
                  apply((current) =>
                    moveChapter(
                      current,
                      selectedNodeInfo.chapter.id,
                      targetSectionId,
                    ),
                  )
                }
                onMerge={() => applyMerge(selectedNodeInfo.chapter.id)}
                onDelete={() => {
                  apply((current) =>
                    deleteChapter(current, selectedNodeInfo.chapter.id),
                  );
                  setSelectedId(null);
                }}
                onReorder={(direction) =>
                  apply((current) =>
                    reorderChapter(
                      current,
                      selectedNodeInfo.chapter.id,
                      direction,
                    ),
                  )
                }
                onSplit={(blockIndex) =>
                  applySplit(selectedNodeInfo.chapter.id, blockIndex)
                }
              />
            ) : (
              <SectionEditor
                section={selectedNodeInfo.section}
                depth={selectedNodeInfo.depth}
                isFirst={selectedNodeInfo.isFirst}
                isLast={selectedNodeInfo.isLast}
                onRenameSection={(title) =>
                  apply((current) =>
                    renameSection(current, selectedNodeInfo.section.id, title),
                  )
                }
                onChangeType={(type) =>
                  apply((current) =>
                    changeSectionType(
                      current,
                      selectedNodeInfo.section.id,
                      type,
                    ),
                  )
                }
                onReorderSection={(direction) =>
                  apply((current) =>
                    reorderSection(
                      current,
                      selectedNodeInfo.section.id,
                      direction,
                    ),
                  )
                }
              />
            )
          ) : (
            <div
              className="h-full flex items-center justify-center text-sm"
              style={{ color: "var(--kd-text-muted)" }}
            >
              Chọn một mục ở cột bên trái để chỉnh sửa.
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between border-t px-4 py-3 sm:rounded-xl sm:border"
        style={{
          background: "var(--kd-surface)",
          borderColor: "var(--kd-border)",
        }}
      >
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <div className="px-2 py-1">
                <CancelJobButton jobId={jobId} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-3">
          <Button asChild type="button" variant="outline">
            <Link href="/library">Lưu bản nháp</Link>
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
            {isPending ? "Đang xử lý…" : "Xác nhận lưu"}
          </Button>
        </div>
      </div>
    </div>
  );
}
