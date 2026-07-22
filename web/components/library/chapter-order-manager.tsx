"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  GripVertical,
  Pencil,
  RotateCcw,
  SortAsc,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteStoryChapter,
  deleteStorySection,
  reorderStoryChapters,
  updateStoryChapterTitle,
  updateStorySection,
} from "@/lib/library/actions";
import type {
  ChapterOrderItem,
  ChapterOrderStory,
} from "@/lib/library/queries";

const INITIAL_STATE = { error: null, message: null };
const NATURAL_COLLATOR = new Intl.Collator("vi", {
  numeric: true,
  sensitivity: "base",
});

type OrderMap = Record<string, ChapterOrderItem[]>;

type DeleteTarget =
  | {
      kind: "chapter";
      id: string;
      title: string;
    }
  | {
      kind: "section";
      id: string;
      title: string;
      directChapterCount: number;
      hasChildren: boolean;
    };

function toOrderMap(story: ChapterOrderStory): OrderMap {
  return Object.fromEntries(
    story.sections.map((section) => [section.id, [...section.chapters]]),
  );
}

function serializeOrder(story: ChapterOrderStory, orders: OrderMap) {
  return JSON.stringify(
    story.sections.map((section) => ({
      sectionId: section.id,
      chapterIds: (orders[section.id] ?? []).map((chapter) => chapter.id),
    })),
  );
}

function chapterNumber(title: string): number | null {
  const match = title.match(/(?:chương|ngoại\s*truyện)\s*(\d+)/iu);
  return match ? Number.parseInt(match[1], 10) : null;
}

function compareChapterTitles(left: ChapterOrderItem, right: ChapterOrderItem) {
  const leftNumber = chapterNumber(left.title);
  const rightNumber = chapterNumber(right.title);
  if (leftNumber !== null && rightNumber !== null) {
    // Returning 0 intentionally preserves the current relative order of
    // variants such as "Ngoại truyện 10" and "Ngoại truyện 10 (bản khác)".
    return leftNumber - rightNumber;
  }
  return (
    NATURAL_COLLATOR.compare(left.title, right.title) ||
    left.id.localeCompare(right.id)
  );
}

export function ChapterOrderManager({ story }: { story: ChapterOrderStory }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    reorderStoryChapters,
    INITIAL_STATE,
  );
  const initialOrders = useMemo(() => toOrderMap(story), [story]);
  const initialPayload = useMemo(
    () => serializeOrder(story, initialOrders),
    [initialOrders, story],
  );
  const [orders, setOrders] = useState<OrderMap>(initialOrders);
  const [submittedPayload, setSubmittedPayload] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{
    sectionId: string;
    chapterId: string;
  } | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionTitle, setSectionTitle] = useState("");
  const [parentSectionId, setParentSectionId] = useState<string | null>(null);
  const [sectionState, setSectionState] = useState<{
    error: string | null;
    message: string | null;
  }>(INITIAL_STATE);
  const [isSectionPending, startSectionTransition] = useTransition();
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterState, setChapterState] = useState<{
    error: string | null;
    message: string | null;
  }>(INITIAL_STATE);
  const [isChapterPending, startChapterTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteState, setDeleteState] = useState<{
    error: string | null;
    message: string | null;
  }>(INITIAL_STATE);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const payload = useMemo(() => serializeOrder(story, orders), [orders, story]);
  const rootSections = useMemo(
    () => story.sections.filter((section) => section.parentSectionId === null),
    [story.sections],
  );
  const savedPayload = state.message
    ? (submittedPayload ?? initialPayload)
    : initialPayload;
  const isDirty = payload !== savedPayload;

  function updateSection(
    sectionId: string,
    update: (chapters: ChapterOrderItem[]) => ChapterOrderItem[],
  ) {
    setOrders((current) => ({
      ...current,
      [sectionId]: update(current[sectionId] ?? []),
    }));
  }

  function moveOne(sectionId: string, chapterId: string, nextIndex: number) {
    updateSection(sectionId, (chapters) => {
      const currentIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
      if (currentIndex < 0) return chapters;
      const boundedIndex = Math.max(0, Math.min(chapters.length - 1, nextIndex));
      if (boundedIndex === currentIndex) return chapters;
      const next = [...chapters];
      const [chapter] = next.splice(currentIndex, 1);
      next.splice(boundedIndex, 0, chapter);
      return next;
    });
  }

  function moveSelected(sectionId: string, edge: "start" | "end") {
    updateSection(sectionId, (chapters) => {
      const selected = chapters.filter((chapter) => selectedIds.has(chapter.id));
      if (selected.length === 0) return chapters;
      const remaining = chapters.filter((chapter) => !selectedIds.has(chapter.id));
      return edge === "start"
        ? [...selected, ...remaining]
        : [...remaining, ...selected];
    });
  }

  function toggleSelected(chapterId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  function resetAll() {
    setOrders(toOrderMap(story));
    setSelectedIds(new Set());
  }

  function naturalSortAll() {
    setOrders((current) =>
      Object.fromEntries(
        story.sections.map((section) => [
          section.id,
          [...(current[section.id] ?? [])].sort(compareChapterTitles),
        ]),
      ),
    );
  }

  function openSectionEditor(sectionId: string) {
    const section = story.sections.find((candidate) => candidate.id === sectionId);
    if (!section) return;
    setEditingSectionId(section.id);
    setSectionTitle(section.title);
    setParentSectionId(section.parentSectionId);
    setSectionState(INITIAL_STATE);
  }

  function closeSectionEditor() {
    setEditingSectionId(null);
    setSectionState(INITIAL_STATE);
  }

  function openChapterEditor(chapter: ChapterOrderItem) {
    setEditingChapterId(chapter.id);
    setChapterTitle(chapter.title);
    setChapterState(INITIAL_STATE);
  }

  function closeChapterEditor() {
    setEditingChapterId(null);
    setChapterTitle("");
    setChapterState(INITIAL_STATE);
  }

  function saveChapterTitle() {
    const chapterId = editingChapterId;
    const title = chapterTitle.trim();
    if (!chapterId || !title) return;

    startChapterTransition(async () => {
      const result = await updateStoryChapterTitle({
        storyId: story.id,
        chapterId,
        title,
      });
      setChapterState(result);
      if (!result.error) {
        setOrders((current) =>
          Object.fromEntries(
            Object.entries(current).map(([sectionId, chapters]) => [
              sectionId,
              chapters.map((chapter) =>
                chapter.id === chapterId ? { ...chapter, title } : chapter,
              ),
            ]),
          ),
        );
        setEditingChapterId(null);
        setChapterTitle("");
        router.refresh();
      }
    });
  }

  function saveSection() {
    if (!editingSectionId || !sectionTitle.trim()) return;
    startSectionTransition(async () => {
      const result = await updateStorySection({
        storyId: story.id,
        sectionId: editingSectionId,
        title: sectionTitle,
        parentSectionId,
      });
      setSectionState(result);
      if (!result.error) {
        setEditingSectionId(null);
        router.refresh();
      }
    });
  }

  function openDeleteDialog(target: DeleteTarget) {
    setDeleteState(INITIAL_STATE);
    setDeleteTarget(target);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startDeleteTransition(async () => {
      const result =
        target.kind === "chapter"
          ? await deleteStoryChapter({ storyId: story.id, targetId: target.id })
          : await deleteStorySection({ storyId: story.id, targetId: target.id });
      setDeleteState(result);
      if (!result.error) {
        setDeleteTarget(null);
        setSelectedIds((current) => {
          if (target.kind !== "chapter" || !current.has(target.id)) return current;
          const next = new Set(current);
          next.delete(target.id);
          return next;
        });
        router.refresh();
      }
    });
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setSubmittedPayload(payload)}
      className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
    >
      <input type="hidden" name="storyId" value={story.id} />
      <input type="hidden" name="order" value={payload} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/library"
            className="text-sm font-semibold hover:underline"
            style={{ color: "var(--kd-gilt)" }}
          >
            ← Quay lại thư viện
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold font-display sm:text-4xl">
            Quản lý chương và section
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--kd-text-muted)" }}>
            {story.title}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={naturalSortAll}>
            <SortAsc size={16} />
            Sắp xếp theo số chương
          </Button>
          <Button type="button" variant="outline" onClick={resetAll} disabled={!isDirty}>
            <RotateCcw size={16} />
            Hoàn tác tất cả
          </Button>
        </div>
      </div>

      <p
        className="mt-5 rounded-xl border p-3 text-sm leading-6"
        style={{ borderColor: "var(--kd-border)", color: "var(--kd-text-muted)" }}
      >
        Kéo chương đến vị trí mới hoặc chọn nhiều chương để đưa cả nhóm lên
        đầu/cuối. Nút bút chì cạnh mỗi chương cho phép đổi tên chương hoặc ngoại
        truyện; nút “Chỉnh section” dùng để đổi tên và đặt một section lá vào
        trong section cấp gốc. Thứ tự chương chỉ được ghi khi bạn bấm “Lưu thứ
        tự”.
      </p>

      {sectionState.error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {sectionState.error}
        </p>
      ) : null}
      {sectionState.message ? (
        <p
          role="status"
          className="mt-4 rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--kd-border)" }}
        >
          {sectionState.message}
        </p>
      ) : null}
      {deleteState.error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {deleteState.error}
        </p>
      ) : null}
      {deleteState.message ? (
        <p
          role="status"
          className="mt-4 rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--kd-border)" }}
        >
          {deleteState.message}
        </p>
      ) : null}

      {story.sections.length === 0 ? (
        <p className="mt-6 rounded-xl border p-6 text-center" style={{ borderColor: "var(--kd-border)" }}>
          Tác phẩm chưa có chương nào để sắp xếp.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {story.sections.map((section) => {
            const chapters = orders[section.id] ?? [];
            const selectedCount = chapters.filter((chapter) =>
              selectedIds.has(chapter.id),
            ).length;
            return (
              <section
                key={section.id}
                className="overflow-hidden rounded-2xl border"
                style={{ borderColor: "var(--kd-border)", background: "var(--kd-surface)" }}
              >
                <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--kd-border)" }}>
                  <div>
                    <h2 className="font-bold">{section.title}</h2>
                    {section.path.length > 1 ? (
                      <p className="mt-1 text-xs" style={{ color: "var(--kd-text-muted)" }}>
                        {section.path.join(" / ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
                      {chapters.length} chương
                      {selectedCount > 0 ? ` · đã chọn ${selectedCount}` : ""}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openSectionEditor(section.id)}
                    >
                      <Pencil size={14} /> Chỉnh section
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isDeletePending}
                      onClick={() =>
                        openDeleteDialog({
                          kind: "section",
                          id: section.id,
                          title: section.title,
                          directChapterCount: chapters.length,
                          hasChildren: section.hasChildren,
                        })
                      }
                      className="text-red-600 hover:bg-red-500/10 hover:text-red-700"
                    >
                      <Trash2 size={14} /> Xoá section
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedCount === 0}
                      onClick={() => moveSelected(section.id, "start")}
                    >
                      <ArrowUpToLine size={14} /> Đầu
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedCount === 0}
                      onClick={() => moveSelected(section.id, "end")}
                    >
                      <ArrowDownToLine size={14} /> Cuối
                    </Button>
                  </div>
                </div>

                {editingSectionId === section.id ? (
                  <div
                    className="grid gap-4 border-b px-4 py-4 sm:grid-cols-2"
                    style={{ borderColor: "var(--kd-border)" }}
                  >
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold">Tên section</span>
                      <Input
                        value={sectionTitle}
                        maxLength={200}
                        onChange={(event) => setSectionTitle(event.target.value)}
                        disabled={isSectionPending}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold">Section cha</span>
                      <select
                        value={parentSectionId ?? ""}
                        disabled={
                          section.hasChildren ||
                          section.type === "volume" ||
                          isSectionPending
                        }
                        onChange={(event) =>
                          setParentSectionId(event.target.value || null)
                        }
                        className="h-10 min-w-0 rounded-md border bg-transparent px-3 text-sm disabled:opacity-60"
                      >
                        <option value="">Cấp gốc</option>
                        {rootSections
                          .filter((candidate) => candidate.id !== section.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.title}
                            </option>
                          ))}
                      </select>
                      {section.hasChildren || section.type === "volume" ? (
                        <span
                          className="text-xs"
                          style={{ color: "var(--kd-text-muted)" }}
                        >
                          Section có section con hoặc là Volume phải ở cấp gốc.
                        </span>
                      ) : null}
                    </label>
                    <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={closeSectionEditor}
                        disabled={isSectionPending}
                      >
                        Hủy
                      </Button>
                      <Button
                        type="button"
                        onClick={saveSection}
                        disabled={!sectionTitle.trim() || isSectionPending}
                      >
                        {isSectionPending ? "Đang lưu…" : "Lưu section"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <ol className="divide-y" style={{ borderColor: "var(--kd-border)" }}>
                  {chapters.map((chapter, index) => (
                    <li
                      key={chapter.id}
                      draggable={!isChapterPending && editingChapterId !== chapter.id}
                      onDragStart={() =>
                        setDragging({ sectionId: section.id, chapterId: chapter.id })
                      }
                      onDragEnd={() => setDragging(null)}
                      onDragOver={(event) => {
                        if (dragging?.sectionId === section.id) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragging?.sectionId === section.id) {
                          moveOne(section.id, dragging.chapterId, index);
                        }
                        setDragging(null);
                      }}
                      className="transition-opacity"
                      style={{ opacity: dragging?.chapterId === chapter.id ? 0.45 : 1 }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <GripVertical
                          size={18}
                          className="shrink-0 cursor-grab"
                          aria-hidden
                          style={{ color: "var(--kd-text-muted)" }}
                        />
                        <input
                          type="checkbox"
                          checked={selectedIds.has(chapter.id)}
                          onChange={() => toggleSelected(chapter.id)}
                          aria-label={`Chọn ${chapter.title}`}
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="w-8 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--kd-text-muted)" }}>
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 break-words text-sm font-medium">
                          {chapter.title}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={isChapterPending}
                          onClick={() => openChapterEditor(chapter)}
                          aria-label={`Chỉnh tên ${chapter.title}`}
                          title="Chỉnh tên chương"
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === 0 || isChapterPending}
                          onClick={() => moveOne(section.id, chapter.id, index - 1)}
                          aria-label={`Đưa ${chapter.title} lên`}
                        >
                          <ArrowUp size={15} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === chapters.length - 1 || isChapterPending}
                          onClick={() => moveOne(section.id, chapter.id, index + 1)}
                          aria-label={`Đưa ${chapter.title} xuống`}
                        >
                          <ArrowDown size={15} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={isDeletePending || isChapterPending}
                          onClick={() =>
                            openDeleteDialog({
                              kind: "chapter",
                              id: chapter.id,
                              title: chapter.title,
                            })
                          }
                          aria-label={`Xoá ${chapter.title}`}
                          className="text-red-600 hover:bg-red-500/10 hover:text-red-700"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                      {editingChapterId === chapter.id ? (
                        <div
                          className="grid gap-3 border-t px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                          style={{ borderColor: "var(--kd-border)" }}
                        >
                          <label className="grid min-w-0 gap-1.5 text-sm">
                            <span className="font-semibold">
                              Tên chương hoặc ngoại truyện
                            </span>
                            <Input
                              value={chapterTitle}
                              maxLength={200}
                              autoFocus
                              disabled={isChapterPending}
                              onChange={(event) => setChapterTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  saveChapterTitle();
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  closeChapterEditor();
                                }
                              }}
                            />
                          </label>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={closeChapterEditor}
                              disabled={isChapterPending}
                            >
                              Hủy
                            </Button>
                            <Button
                              type="button"
                              onClick={saveChapterTitle}
                              disabled={!chapterTitle.trim() || isChapterPending}
                            >
                              {isChapterPending ? "Đang lưu…" : "Lưu tên"}
                            </Button>
                          </div>
                          {chapterState.error ? (
                            <p role="alert" className="text-sm text-red-600 sm:col-span-2">
                              {chapterState.error}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {chapters.length === 0 ? (
                  <p
                    className="px-4 py-5 text-center text-sm"
                    style={{ color: "var(--kd-text-muted)" }}
                  >
                    Section này chưa có chương trực tiếp.
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {state.error ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="mt-4 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--kd-border)" }}>
          {state.message}
        </p>
      ) : null}

      {editingChapterId === null && editingSectionId === null ? (
        <div className="sticky bottom-4 mt-6 flex justify-end rounded-xl border p-3 shadow-lg" style={{ borderColor: "var(--kd-border)", background: "var(--kd-surface)" }}>
          <Button type="submit" disabled={!isDirty || isPending || story.sections.length === 0}>
            {isPending ? "Đang lưu…" : "Lưu thứ tự"}
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletePending) {
            setDeleteTarget(null);
            setDeleteState(INITIAL_STATE);
          }
        }}
      >
        <AlertDialogContent className="border-[var(--kd-border)] bg-[var(--kd-surface)] text-[var(--kd-text)]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "chapter"
                ? `Xoá vĩnh viễn “${deleteTarget.title}”?`
                : `Xoá section “${deleteTarget?.title ?? ""}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[var(--kd-text-muted)]">
              {deleteTarget?.kind === "chapter" ? (
                <>
                  Chương, nội dung, tiến độ đọc và ghi chú của chương này sẽ bị
                  xoá vĩnh viễn. Thao tác này không thể hoàn tác.
                </>
              ) : (
                <>
                  Chỉ tên và cấu trúc của section bị xoá.{" "}
                  {deleteTarget?.directChapterCount ?? 0} chương trực tiếp sẽ
                  được chuyển lên section cha hoặc “Chưa phân hồi”
                  {deleteTarget?.hasChildren
                    ? ", còn các section con sẽ được nâng lên một cấp."
                    : "."}
                </>
              )}
              {isDirty ? (
                <span className="block font-medium text-amber-700">
                  Thứ tự đang chỉnh chưa được lưu và sẽ được tải lại sau khi xoá.
                </span>
              ) : null}
              {deleteState.error ? (
                <span className="block text-red-600">{deleteState.error}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletePending}>
              Giữ lại
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletePending}
              onClick={confirmDelete}
            >
              {isDeletePending
                ? "Đang xoá…"
                : deleteTarget?.kind === "chapter"
                  ? "Xoá vĩnh viễn"
                  : "Xoá section, giữ chương"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
