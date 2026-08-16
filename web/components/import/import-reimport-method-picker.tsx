"use client";

import { Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ImportReimportFileForm } from "@/components/import/import-reimport-file-form";
import { ImportReimportGoogleDocsForm } from "@/components/import/import-reimport-google-docs-form";
import { ImportReimportPasteForm } from "@/components/import/import-reimport-paste-form";
import { ImportReimportTargetPicker } from "@/components/import/import-reimport-target-picker";
import { Button } from "@/components/ui/button";
import {
  APPEND_NEW_SECTION_VALUE,
  type AppendSectionOption,
} from "@/lib/import/append-target";
import type { ReimportMode } from "@/lib/import/reimport-mode";
import type { ReimportUpdateScope } from "@/lib/import/reimport-scope";
import type { ChapterOrderStory } from "@/lib/library/queries";

type Method = "paste" | "file" | "gdoc";

function findScopeLabel(
  story: ChapterOrderStory,
  scope: ReimportUpdateScope,
): string {
  if (scope.kind === "story") return `Toàn bộ “${story.title}”`;
  if (scope.kind === "section") {
    const section = story.sections.find((candidate) => candidate.id === scope.targetId);
    return section ? section.path.join(" / ") : "Section đã chọn";
  }
  for (const section of story.sections) {
    const chapter = section.chapters.find((candidate) => candidate.id === scope.targetId);
    if (chapter) return `${section.path.join(" / ")} / ${chapter.title}`;
  }
  return "Chương đã chọn";
}

export function ImportReimportMethodPicker({
  story,
  sectionOptions,
}: {
  story: ChapterOrderStory;
  sectionOptions: AppendSectionOption[];
}) {
  const [method, setMethod] = useState<Method>("paste");
  const [mode, setMode] = useState<ReimportMode>("append");
  const [appendTargetSectionId, setAppendTargetSectionId] = useState(
    sectionOptions.at(-1)?.id ?? APPEND_NEW_SECTION_VALUE,
  );
  const [updateScope, setUpdateScope] = useState<ReimportUpdateScope | null>(null);
  const updateScopeLabel = useMemo(
    () => (updateScope ? findScopeLabel(story, updateScope) : ""),
    [story, updateScope],
  );
  const canShowSourceForm = mode === "append" || updateScope !== null;
  const submittedScope = updateScope ?? { kind: "story" as const };
  const sourceFormKey =
    mode === "append"
      ? "append"
      : submittedScope.kind === "story"
        ? "update-story"
        : `update-${submittedScope.kind}-${submittedScope.targetId}`;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Bạn muốn làm gì?</legend>
        <button
          type="button"
          onClick={() => setMode("append")}
          className="rounded-xl border p-4 text-left transition-colors"
          style={{
            borderColor:
              mode === "append" ? "var(--kd-gilt)" : "var(--kd-border)",
            background:
              mode === "append" ? "var(--kd-surface-raised)" : "transparent",
          }}
          aria-pressed={mode === "append"}
        >
          <span className="block font-bold">Nối tiếp tác phẩm</span>
          <span className="mt-1 block text-xs leading-5" style={{ color: "var(--kd-text-muted)" }}>
            Thêm các chương mới vào cuối, giữ nguyên toàn bộ chương hiện có.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("update")}
          className="rounded-xl border p-4 text-left transition-colors"
          style={{
            borderColor:
              mode === "update" ? "var(--kd-gilt)" : "var(--kd-border)",
            background:
              mode === "update" ? "var(--kd-surface-raised)" : "transparent",
          }}
          aria-pressed={mode === "update"}
        >
          <span className="block font-bold">Cập nhật chương đã có</span>
          <span className="mt-1 block text-xs leading-5" style={{ color: "var(--kd-text-muted)" }}>
            Chọn đúng chương, hồi hoặc arc trước khi đưa bản nội dung mới vào.
          </span>
        </button>
      </fieldset>

      {mode === "append" ? (
        <label className="grid gap-2 text-sm font-semibold">
          Nối các chương mới vào
          <select
            value={appendTargetSectionId}
            onChange={(event) => setAppendTargetSectionId(event.target.value)}
            className="h-11 rounded-md border bg-transparent px-3 text-sm font-normal"
            style={{ borderColor: "var(--kd-border)" }}
          >
            {sectionOptions.map((section) => (
              <option key={section.id} value={section.id}>
                {`${"— ".repeat(section.depth)}${section.title}`}
              </option>
            ))}
            <option value={APPEND_NEW_SECTION_VALUE}>
              Giữ cấu trúc file và tạo phân hồi mới
            </option>
          </select>
          <span className="text-xs font-normal leading-5" style={{ color: "var(--kd-text-muted)" }}>
            Khi chọn phân hồi có sẵn, mọi chương trong các file sẽ được nối theo thứ tự vào cuối phân hồi đó.
          </span>
        </label>
      ) : updateScope === null ? (
        <ImportReimportTargetPicker story={story} onSelect={setUpdateScope} />
      ) : (
        <div
          className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
          style={{
            borderColor: "var(--kd-gilt)",
            background: "var(--kd-surface-raised)",
          }}
        >
          <div className="flex min-w-0 items-start gap-3">
            <Pencil className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase" style={{ color: "var(--kd-text-muted)" }}>
                Phạm vi cập nhật
              </p>
              <p className="mt-1 break-words text-sm font-bold">{updateScopeLabel}</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--kd-text-muted)" }}>
                Các chương nằm ngoài phạm vi này sẽ được giữ nguyên.
              </p>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setUpdateScope(null)}>
            <X size={14} /> Chọn mục khác
          </Button>
        </div>
      )}

      {canShowSourceForm ? (
        <>
          <div
            className="flex w-fit flex-wrap gap-1 rounded-lg border p-1"
            style={{ borderColor: "var(--kd-border)" }}
          >
            <Button
              type="button"
              size="sm"
              variant={method === "paste" ? "default" : "ghost"}
              onClick={() => setMethod("paste")}
            >
              Paste text
            </Button>
            <Button
              type="button"
              size="sm"
              variant={method === "file" ? "default" : "ghost"}
              onClick={() => setMethod("file")}
            >
              Tải file lên
            </Button>
            <Button
              type="button"
              size="sm"
              variant={method === "gdoc" ? "default" : "ghost"}
              onClick={() => setMethod("gdoc")}
            >
              Google Docs
            </Button>
          </div>
          {method === "paste" ? (
            <ImportReimportPasteForm
              key={sourceFormKey}
              storyId={story.id}
              storyTitle={story.title}
              mode={mode}
              appendTargetSectionId={appendTargetSectionId}
              updateScope={submittedScope}
              updateScopeLabel={updateScopeLabel}
            />
          ) : method === "file" ? (
            <ImportReimportFileForm
              key={sourceFormKey}
              storyId={story.id}
              storyTitle={story.title}
              mode={mode}
              appendTargetSectionId={appendTargetSectionId}
              updateScope={submittedScope}
              updateScopeLabel={updateScopeLabel}
            />
          ) : (
            <ImportReimportGoogleDocsForm
              key={sourceFormKey}
              storyId={story.id}
              storyTitle={story.title}
              mode={mode}
              appendTargetSectionId={appendTargetSectionId}
              updateScope={submittedScope}
              updateScopeLabel={updateScopeLabel}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
