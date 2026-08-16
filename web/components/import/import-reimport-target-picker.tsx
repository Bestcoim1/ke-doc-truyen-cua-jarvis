"use client";

import { BookOpen, Layers3, Pencil, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReimportUpdateScope } from "@/lib/import/reimport-scope";
import type { ChapterOrderStory } from "@/lib/library/queries";

function normalized(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("vi");
}

function sectionKindLabel(type: ChapterOrderStory["sections"][number]["type"]) {
  if (type === "volume") return "Quyển";
  if (type === "part") return "Hồi / Phần";
  return "Arc";
}

export function ImportReimportTargetPicker({
  story,
  onSelect,
}: {
  story: ChapterOrderStory;
  onSelect: (scope: ReimportUpdateScope) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const sectionIdsByParent = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const section of story.sections) {
      if (!section.parentSectionId) continue;
      const ids = result.get(section.parentSectionId) ?? [];
      ids.push(section.id);
      result.set(section.parentSectionId, ids);
    }
    return result;
  }, [story.sections]);

  const subtreeChapterCount = useMemo(() => {
    const sectionById = new Map(
      story.sections.map((section) => [section.id, section]),
    );
    const counts = new Map<string, number>();
    const count = (sectionId: string): number => {
      const cached = counts.get(sectionId);
      if (cached !== undefined) return cached;
      const value =
        (sectionById.get(sectionId)?.chapters.length ?? 0) +
        (sectionIdsByParent.get(sectionId) ?? []).reduce(
          (total, childId) => total + count(childId),
          0,
        );
      counts.set(sectionId, value);
      return value;
    };
    for (const section of story.sections) count(section.id);
    return counts;
  }, [sectionIdsByParent, story.sections]);

  const visibleSections = useMemo(() => {
    const needle = normalized(deferredQuery);
    if (!needle) return story.sections;
    return story.sections.flatMap((section) => {
      const sectionMatches = normalized(section.path.join(" / ")).includes(needle);
      const chapters = section.chapters.filter((chapter) =>
        normalized(chapter.title).includes(needle),
      );
      return sectionMatches || chapters.length > 0
        ? [{ ...section, chapters: sectionMatches ? section.chapters : chapters }]
        : [];
    });
  }, [deferredQuery, story.sections]);

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-extrabold">Chọn chính xác mục cần cập nhật</h2>
        <p className="mt-1 text-sm leading-6" style={{ color: "var(--kd-text-muted)" }}>
          Nút bút chì ở section cập nhật toàn bộ chương trong section đó và các
          section con. Nút cạnh chương chỉ cập nhật đúng một chương.
        </p>
      </div>

      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
          style={{ color: "var(--kd-text-muted)" }}
        />
        <span className="sr-only">Tìm chương, hồi hoặc arc</span>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm chương, hồi hoặc arc…"
          className="pl-9"
        />
      </label>

      {visibleSections.length > 0 ? (
        <div className="space-y-4">
          {visibleSections.map((section) => (
            <section
              key={section.id}
              className="overflow-hidden rounded-2xl border"
              style={{
                borderColor: "var(--kd-border)",
                background: "var(--kd-surface)",
              }}
            >
              <div
                className="flex items-center gap-3 border-b px-4 py-3"
                style={{ borderColor: "var(--kd-border)" }}
              >
                <Layers3 className="size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{section.title}</h3>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{
                        borderColor: "var(--kd-border)",
                        color: "var(--kd-text-muted)",
                      }}
                    >
                      {sectionKindLabel(section.type)}
                    </span>
                  </div>
                  {section.path.length > 1 ? (
                    <p className="mt-1 truncate text-xs" style={{ color: "var(--kd-text-muted)" }}>
                      {section.path.join(" / ")}
                    </p>
                  ) : null}
                </div>
                <span className="hidden shrink-0 text-xs sm:inline" style={{ color: "var(--kd-text-muted)" }}>
                  {subtreeChapterCount.get(section.id) ?? 0} chương
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => onSelect({ kind: "section", targetId: section.id })}
                  aria-label={`Cập nhật ${sectionKindLabel(section.type)} ${section.title}`}
                  title={`Cập nhật toàn bộ ${sectionKindLabel(section.type).toLocaleLowerCase("vi")}`}
                >
                  <Pencil size={15} />
                </Button>
              </div>

              {section.chapters.length > 0 ? (
                <ol className="divide-y" style={{ borderColor: "var(--kd-border)" }}>
                  {section.chapters.map((chapter, index) => (
                    <li key={chapter.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className="w-7 shrink-0 text-right text-xs tabular-nums"
                        style={{ color: "var(--kd-text-muted)" }}
                      >
                        {index + 1}
                      </span>
                      <BookOpen className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 break-words text-sm font-medium">
                        {chapter.title}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => onSelect({ kind: "chapter", targetId: chapter.id })}
                        aria-label={`Cập nhật chương ${chapter.title}`}
                        title="Cập nhật đúng chương này"
                      >
                        <Pencil size={15} />
                      </Button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-4 py-4 text-center text-sm" style={{ color: "var(--kd-text-muted)" }}>
                  Section này không có chương trực tiếp.
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border p-6 text-center text-sm" style={{ borderColor: "var(--kd-border)" }}>
          Không tìm thấy mục nào khớp với “{query}”.
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--kd-border)" }}>
        <div>
          <p className="text-sm font-semibold">Cần thay toàn bộ bản thảo?</p>
          <p className="text-xs leading-5" style={{ color: "var(--kd-text-muted)" }}>
            Luồng cũ vẫn được giữ cho những lần đồng bộ toàn bộ tác phẩm.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => onSelect({ kind: "story" })}>
          Cập nhật toàn bộ
        </Button>
      </div>
    </div>
  );
}
