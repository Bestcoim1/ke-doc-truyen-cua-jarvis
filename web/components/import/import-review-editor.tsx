"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewImportDraft } from "@/lib/import/actions";
import {
  deleteChapter,
  flattenReviewChapters,
  flattenSectionOptions,
  mergeChapterWithPrevious,
  moveChapter,
  renameChapter,
  renameSection,
  type ReviewDraft,
  type ReviewSection,
  type SectionOption,
} from "@/lib/import/review-draft";

const INITIAL_STATE = { error: null, message: null };

const SECTION_LABELS = {
  arc: "Hồi / Arc",
  part: "Phần / Part",
  volume: "Quyển / Volume",
} as const;

type SectionEditorProps = {
  section: ReviewSection;
  currentDraft: ReviewDraft;
  setDraft: React.Dispatch<React.SetStateAction<ReviewDraft>>;
  sectionOptions: SectionOption[];
  mergeableChapterIds: Set<string>;
  depth?: number;
};

function SectionEditor({
  section,
  currentDraft,
  setDraft,
  sectionOptions,
  mergeableChapterIds,
  depth = 0,
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
        <Badge variant="outline" className="w-fit shrink-0">
          {SECTION_LABELS[section.type]}
        </Badge>
        <label className="sr-only" htmlFor={`section-${section.id}`}>
          Tên section
        </label>
        <Input
          id={`section-${section.id}`}
          value={section.title}
          maxLength={200}
          onChange={(event) =>
            setDraft((draft) => renameSection(draft, section.id, event.target.value))
          }
          className="h-10 font-semibold"
        />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {section.chapters.map((chapter) => (
          <article
            key={chapter.id}
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--kd-border)" }}
          >
            <label className="sr-only" htmlFor={`chapter-${chapter.id}`}>
              Tên chapter
            </label>
            <Input
              id={`chapter-${chapter.id}`}
              value={chapter.title}
              maxLength={200}
              onChange={(event) =>
                setDraft((draft) =>
                  renameChapter(draft, chapter.id, event.target.value),
                )
              }
              className="h-10"
            />

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span style={{ color: "var(--kd-text-muted)" }}>
                {chapter.wordCount.toLocaleString("vi-VN")} từ
              </span>
              {chapter.kind === "extra" ? <Badge variant="secondary">Ngoại truyện</Badge> : null}
              {!chapter.contentText.trim() ? (
                <Badge variant="destructive">Chapter rỗng</Badge>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="grid gap-1 text-xs">
                <span style={{ color: "var(--kd-text-muted)" }}>Chuyển tới section</span>
                <select
                  value={section.id}
                  onChange={(event) =>
                    setDraft((draft) =>
                      moveChapter(draft, chapter.id, event.target.value),
                    )
                  }
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
                disabled={!mergeableChapterIds.has(chapter.id)}
                onClick={() =>
                  setDraft((draft) => mergeChapterWithPrevious(draft, chapter.id))
                }
              >
                Gộp với chương trước
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="self-end"
                onClick={() => setDraft((draft) => deleteChapter(draft, chapter.id))}
              >
                Xóa chapter
              </Button>
            </div>
          </article>
        ))}
      </div>

      {section.children.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {section.children.map((child) => (
            <SectionEditor
              key={child.id}
              section={child}
              currentDraft={currentDraft}
              setDraft={setDraft}
              sectionOptions={sectionOptions}
              mergeableChapterIds={mergeableChapterIds}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ImportReviewEditor({
  jobId,
  initialDraft,
}: {
  jobId: string;
  initialDraft: ReviewDraft;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [state, formAction, isPending] = useActionState(
    reviewImportDraft,
    INITIAL_STATE,
  );
  const sectionOptions = useMemo(
    () => flattenSectionOptions(draft.sections),
    [draft.sections],
  );
  const mergeableChapterIds = useMemo(
    () =>
      new Set(
        flattenReviewChapters(draft.sections)
          .slice(1)
          .map((entry) => entry.chapter.id),
      ),
    [draft.sections],
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="draft" value={JSON.stringify(draft)} />

      <div>
        <p className="text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Bản review
        </p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{draft.title}</h1>
        {draft.description ? (
          <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--kd-text-muted)" }}>
            {draft.description}
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Section", draft.stats.sectionCount],
          ["Chapter", draft.stats.chapterCount],
          ["Từ", draft.stats.wordCount.toLocaleString("vi-VN")],
          ["Cảnh báo", draft.warnings.length],
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

      {draft.warnings.length > 0 ? (
        <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <h2 className="font-semibold">Cần kiểm tra</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      <div className="flex flex-col gap-3">
        {draft.sections.map((section) => (
          <SectionEditor
            key={section.id}
            section={section}
            currentDraft={draft}
            setDraft={setDraft}
            sectionOptions={sectionOptions}
            mergeableChapterIds={mergeableChapterIds}
          />
        ))}
      </div>

      {draft.stats.chapterCount === 0 ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Cần giữ lại ít nhất một chapter để commit.
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
        className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-xl sm:border"
        style={{ background: "color-mix(in srgb, var(--kd-bg) 92%, transparent)" }}
      >
        <Button asChild type="button" variant="ghost">
          <Link href="/library">Về thư viện</Link>
        </Button>
        <Button type="submit" name="intent" value="save" variant="outline" disabled={isPending}>
          {isPending ? "Đang xử lý…" : "Lưu bản nháp"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="commit"
          disabled={isPending || draft.stats.chapterCount === 0}
        >
          {isPending ? "Đang xử lý…" : "Commit vào kệ đọc"}
        </Button>
      </div>
    </form>
  );
}
