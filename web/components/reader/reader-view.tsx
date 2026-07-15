"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, List } from "lucide-react";

import type { Block, ReadingSettings } from "@/lib/reader/types";
import { FONT_SIZE_STEPS } from "@/lib/reader/types";
import { extractFingerprintFromAnchorId } from "@/lib/reader/anchor-utils";
import { updateReadingSettings, createAnnotation, updateAnnotation, deleteAnnotation } from "@/lib/reader/actions";
import { savePendingProgress } from "@/lib/offline/storage";
import type { ResumeFallbackMethod } from "@/lib/reader/resume-fallback";
import type { ChapterRow, SectionRow } from "@/lib/reader/tree";
import { BlockRenderer } from "./block-renderer";
import { TocPanel } from "./toc-panel";
import { SettingsSheet } from "./settings-sheet";
import { AnnotationPopover } from "./annotation-popover";
import type { ChapterAnnotationRow } from "@/lib/reader/queries";

type ReadState = {
  maxProgressPct: number;
  completedContentHash: string | null;
};

function scrollAnchorToFocusLine(container: HTMLElement, anchorId: string) {
  const el = container.querySelector<HTMLElement>(
    `[data-anchor-id="${CSS.escape(anchorId)}"]`,
  );
  if (!el) return;
  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const targetY = containerRect.height * 0.3;
  const delta = elRect.top - containerRect.top - targetY;
  container.scrollTop += delta;
}

export function ReaderView({
  storyId,
  storyTitle,
  coverImageUrl,
  chapter,
  prevChapterId,
  nextChapterEntry,
  resumeAnchorId,
  resumeFallbackMethod,
  chapterReadState,
  initialSettings,
  tocSections,
  tocChapters,
  tocReadStates,
  initialAnnotations = [],
}: {
  storyId: string;
  storyTitle: string;
  coverImageUrl?: string | null;
  chapter: {
    chapterId: string;
    chapterTitle: string;
    sectionPath: string[];
    revisionId: string;
    contentHash: string;
    blocks: Block[];
  };
  prevChapterId: string | null;
  nextChapterEntry: { chapterId: string; chapterTitle: string } | null;
  resumeAnchorId: string | null;
  resumeFallbackMethod: ResumeFallbackMethod | null;
  chapterReadState: ReadState | null;
  initialSettings: ReadingSettings;
  tocSections: SectionRow[];
  tocChapters: ChapterRow[];
  tocReadStates: Record<string, ReadState>;
  initialAnnotations?: ChapterAnnotationRow[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [progressPct, setProgressPct] = useState(
    chapterReadState?.maxProgressPct ?? 0,
  );
  const [annotations, setAnnotations] = useState<ChapterAnnotationRow[]>(
    initialAnnotations,
  );
  // One-time, dismissible: PRD §10.2/FR-10 — only surfaced when resume had
  // to fall back beyond an exact anchor match (nearby paragraph or ordinal
  // ratio), never for the common exact-match case.
  const [showResumeNotice, setShowResumeNotice] = useState(
    resumeFallbackMethod !== null && resumeFallbackMethod !== "exact",
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const endSentinelRef = useRef<HTMLDivElement>(null);
  const currentAnchorRef = useRef<string | null>(resumeAnchorId);
  const hasSeenEndRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<{
    anchorId: string;
    ordinal: number;
    pct: number;
    writeId: string;
    observedAt: string;
  } | null>(null);

  const ordinalByAnchor = useMemo(() => {
    const map = new Map<string, number>();
    chapter.blocks.forEach((block, index) => map.set(block.anchor_id, index));
    return map;
  }, [chapter.blocks]);

  /**
   * All progress writes go through /api/reader/progress with
   * `keepalive: true`: the flush triggers that matter (chapter
   * navigation, pagehide, tab hide) fire right before the document goes
   * away, and Server Action POSTs get aborted at exactly those moments.
   * keepalive lets the browser complete the request after navigation
   * starts (FR-10 / AC-PROG-03).
   *
   * writeId/observedAt were captured when the anchor was observed, so a
   * delayed delivery keeps its original timestamp and the server's
   * ordering guard can reject it against newer writes from other devices.
   */
  const flushProgress = useCallback(
    (completion?: "reader_end" | "next_action") => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const pending = pendingProgressRef.current;
      pendingProgressRef.current = null;

      const anchorId =
        pending?.anchorId ??
        currentAnchorRef.current ??
        chapter.blocks.at(-1)?.anchor_id ??
        "";
      const body: {
        progress?: Record<string, unknown>;
        chapterState?: Record<string, unknown>;
      } = {};

      if (pending) {
        body.progress = {
          storyId,
          chapterId: chapter.chapterId,
          chapterRevisionId: chapter.revisionId,
          paragraphAnchorId: pending.anchorId,
          paragraphFingerprint: extractFingerprintFromAnchorId(
            pending.anchorId,
          ),
          paragraphOrdinal: pending.ordinal,
          paragraphOffsetRatio: null,
          chapterProgressPct: pending.pct,
          writeId: pending.writeId,
          observedAt: pending.observedAt,
        };
      }
      if (pending || completion) {
        body.chapterState = {
          storyId,
          chapterId: chapter.chapterId,
          revisionId: chapter.revisionId,
          contentHash: chapter.contentHash,
          anchorId,
          progressPct: completion ? 100 : (pending?.pct ?? 0),
          markCompleted: Boolean(completion),
          completionMethod: completion ?? null,
        };
      }
      if (!body.progress && !body.chapterState) return;

      if (!navigator.onLine) {
        savePendingProgress(body).catch(console.error);
        return;
      }

      try {
        void fetch("/api/reader/progress", {
          method: "POST",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => {
          // fetch failed (e.g. network lost mid-flight)
          savePendingProgress(body).catch(console.error);
        });
      } catch {
        // keepalive quota exceeded or offline — save to IDB instead
        savePendingProgress(body).catch(console.error);
      }
    },
    [
      storyId,
      chapter.chapterId,
      chapter.revisionId,
      chapter.contentHash,
      chapter.blocks,
    ],
  );

  const onFocusAnchorChange = useCallback(
    (anchorId: string) => {
      currentAnchorRef.current = anchorId;
      const ordinal = ordinalByAnchor.get(anchorId) ?? 0;
      const pct = Math.round(((ordinal + 1) / chapter.blocks.length) * 100);
      setProgressPct(pct);
      pendingProgressRef.current = {
        anchorId,
        ordinal,
        pct,
        writeId: crypto.randomUUID(),
        observedAt: new Date().toISOString(),
      };

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => flushProgress(), 750);
    },
    [ordinalByAnchor, chapter.blocks.length, flushProgress],
  );

  // Resume scroll: run before paint so there's no visible jump.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !resumeAnchorId) return;
    scrollAnchorToFocusLine(container, resumeAnchorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus-line tracking via a zero-height IntersectionObserver band at 30%
  // from the top — event-driven, not a per-scroll-frame handler.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((entry) => entry.isIntersecting);
        if (intersecting.length === 0) return;
        intersecting.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        );
        const anchorId = intersecting[0].target.getAttribute("data-anchor-id");
        if (anchorId && anchorId !== currentAnchorRef.current) {
          onFocusAnchorChange(anchorId);
        }
      },
      { root: container, rootMargin: "-30% 0px -70% 0px", threshold: 0 },
    );

    container
      .querySelectorAll("[data-anchor-id]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [chapter.chapterId, onFocusAnchorChange]);

  // End-of-chapter completion: 3s dwell on the end sentinel, no scroll needed.
  useEffect(() => {
    hasSeenEndRef.current = false;
    const container = containerRef.current;
    const sentinel = endSentinelRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          hasSeenEndRef.current = true;
          endTimerRef.current = setTimeout(() => {
            flushProgress("reader_end");
          }, 3000);
        } else if (endTimerRef.current) {
          clearTimeout(endTimerRef.current);
          endTimerRef.current = null;
        }
      },
      { root: container, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    };
  }, [chapter.chapterId, flushProgress]);

  // Flush on tab hide / navigation away / unmount.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flushProgress();
    }
    function onPageHide() {
      flushProgress();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      flushProgress();
    };
  }, [flushProgress]);

  // Browser/system Back closes an open overlay before leaving the page.
  useEffect(() => {
    function onPopState() {
      setShowToc(false);
      setShowSettings(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function openOverlay(which: "toc" | "settings") {
    window.history.pushState({ kdOverlay: which }, "");
    if (which === "toc") setShowToc(true);
    else setShowSettings(true);
  }

  function closeOverlays() {
    if ((window.history.state as { kdOverlay?: string } | null)?.kdOverlay) {
      window.history.back();
    } else {
      setShowToc(false);
      setShowSettings(false);
    }
  }

  function updateSetting(patch: Partial<ReadingSettings>) {
    const anchorId = currentAnchorRef.current;
    setSettings((prev) => ({ ...prev, ...patch }));
    void updateReadingSettings(patch);
    if (anchorId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = containerRef.current;
          if (container) scrollAnchorToFocusLine(container, anchorId);
        });
      });
    }
  }

  function goToChapter(chapterId: string) {
    flushProgress();
    // A full navigation, not router.push(): the client Router Cache was
    // observed reusing a stale render across [chapterId] param changes on
    // the same page template (confirmed via direct server-side fetches
    // returning correct, distinct data per chapter — the staleness is
    // client-only). Correctness matters far more than SPA transition
    // smoothness for chapter-to-chapter navigation here.
    window.location.href = `/read/${storyId}/${chapterId}`;
  }

  function handleNext() {
    flushProgress(hasSeenEndRef.current ? "next_action" : undefined);
    if (nextChapterEntry) {
      window.location.href = `/read/${storyId}/${nextChapterEntry.chapterId}`;
    }
  }

  const handleHighlight = useCallback(
    async (
      anchorId: string,
      startOffset: number,
      endOffset: number,
      color: string,
      note?: string
    ) => {
      const tempId = `temp-${Date.now()}`;
      const newAnn: ChapterAnnotationRow = {
        id: tempId,
        user_id: "",
        story_id: storyId,
        chapter_id: chapter.chapterId,
        anchor_id: anchorId,
        start_offset: startOffset,
        end_offset: endOffset,
        color,
        note: note || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      let overlappingIds: string[] = [];
      
      setAnnotations((prev) => {
        const overlaps = prev.filter(
          (a) =>
            a.anchor_id === anchorId &&
            a.start_offset < endOffset &&
            a.end_offset > startOffset
        );
        overlappingIds = overlaps.map((a) => a.id);
        
        const filtered = prev.filter((a) => !overlappingIds.includes(a.id));
        return [...filtered, newAnn];
      });

      // Fire and forget deletions for overlapping annotations
      overlappingIds.forEach((id) => {
        if (!id.startsWith("temp-")) {
          deleteAnnotation(id).catch(console.error);
        }
      });

      try {
        const id = await createAnnotation({
          storyId,
          chapterId: chapter.chapterId,
          anchorId,
          startOffset,
          endOffset,
          color,
          note,
        });
        setAnnotations((prev) =>
          prev.map((a) => (a.id === tempId ? { ...a, id } : a))
        );
      } catch (err) {
        setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
      }
    },
    [storyId, chapter.chapterId]
  );

  const handleUpdateAnnotation = useCallback(
    async (id: string, color: string, note?: string) => {
      // Optimistic update
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, color, note: note || null } : a))
      );
      try {
        await updateAnnotation(id, { color, note: note || null });
      } catch (err) {
        // Simple rollback if needed, though omitted for brevity
        console.error("Failed to update annotation", err);
      }
    },
    []
  );

  const handleDeleteAnnotation = useCallback(
    async (id: string) => {
      // Optimistic delete
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      try {
        await deleteAnnotation(id);
      } catch (err) {
        console.error("Failed to delete annotation", err);
      }
    },
    []
  );

  return (
    <div
      className="relative flex h-[100dvh] flex-col overflow-hidden"
      data-kd-theme={settings.theme}
      style={{ background: "var(--kd-bg)", color: "var(--kd-text)" }}
    >
      {coverImageUrl && (
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${coverImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(60px)",
            opacity: settings.theme === "dark" ? 0.35 : 0.2,
            zIndex: 0
          }}
        />
      )}

      <header
        className="relative z-10 flex flex-shrink-0 items-center gap-2 border-b px-3 py-3"
        style={{
          borderColor: "var(--kd-border)",
          background: "var(--kd-surface)",
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        <button
          onClick={() => router.push("/library")}
          aria-label="Về thư viện"
          className="flex h-11 w-11 items-center justify-center rounded-md"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-xs font-display"
            style={{ color: "var(--kd-text-muted)" }}
          >
            {[storyTitle, ...chapter.sectionPath].join(" · ")}
          </div>
          <div className="truncate text-sm font-bold font-display">
            {chapter.chapterTitle}
          </div>
        </div>
        <button
          onClick={() => openOverlay("toc")}
          aria-label="Mục lục"
          className="flex h-11 w-11 items-center justify-center rounded-md"
        >
          <List size={18} />
        </button>
        <button
          onClick={() => openOverlay("settings")}
          aria-label="Tuỳ chỉnh đọc"
          className="flex h-11 w-11 items-center justify-center rounded-md text-sm font-extrabold"
        >
          Aa
        </button>
      </header>

      <div
        className="h-[3px] flex-shrink-0"
        style={{ background: "var(--kd-border)" }}
      >
        <div
          className="h-full transition-[width]"
          style={{ width: `${progressPct}%`, background: "var(--kd-accent)" }}
        />
      </div>

      {showResumeNotice ? (
        <div
          role="status"
          className="flex flex-shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs"
          style={{
            background: "var(--kd-surface)",
            color: "var(--kd-text-muted)",
          }}
        >
          <span>
            Nội dung chương đã thay đổi — đã mở gần đúng vị trí bạn đọc lần
            trước.
          </span>
          <button
            onClick={() => setShowResumeNotice(false)}
            aria-label="Đóng thông báo"
            className="shrink-0 underline"
          >
            Đã hiểu
          </button>
        </div>
      ) : null}

      <main
        ref={containerRef}
        aria-label={chapter.chapterTitle}
        className="relative z-10 flex-1 overflow-y-auto px-5 py-5 font-serif"
        style={{
          fontSize: `${FONT_SIZE_STEPS[settings.fontSizeStep]}px`,
          lineHeight: settings.lineHeight,
          // Landscape on a notched device: keep prose clear of the side notch.
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        <AnnotationPopover
          containerRef={containerRef}
          onHighlight={handleHighlight}
          onUpdate={handleUpdateAnnotation}
          onDelete={handleDeleteAnnotation}
          annotations={annotations}
        />
        <BlockRenderer blocks={chapter.blocks} annotations={annotations} />
        <div ref={endSentinelRef} />
        <div
          className="mt-8 border-t pt-4 text-center"
          style={{ borderColor: "var(--kd-border)" }}
        >
          {nextChapterEntry ? (
            <>
              <div
                className="mb-2 text-xs"
                style={{ color: "var(--kd-text-muted)" }}
              >
                Chương tiếp theo
              </div>
              <button
                className="rounded-full px-5 py-2.5 text-sm font-bold"
                style={{
                  background: "var(--kd-accent)",
                  color: "var(--kd-accent-foreground)",
                }}
                onClick={handleNext}
              >
                {nextChapterEntry.chapterTitle}
              </button>
            </>
          ) : (
            <div className="text-sm" style={{ color: "var(--kd-text-muted)" }}>
              Đã hết chương.
            </div>
          )}
        </div>
      </main>

      <footer
        className="relative z-10 flex flex-shrink-0 items-center justify-between border-t px-3 py-3"
        style={{
          borderColor: "var(--kd-border)",
          background: "var(--kd-surface)",
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        <button
          className="flex min-h-11 items-center gap-1 text-sm font-semibold disabled:opacity-30"
          disabled={!prevChapterId}
          onClick={() => prevChapterId && goToChapter(prevChapterId)}
        >
          <ChevronLeft size={16} /> Chương trước
        </button>
        <span className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
          {progressPct}% chương này
        </span>
        <button
          className="flex min-h-11 items-center gap-1 text-sm font-semibold disabled:opacity-30"
          disabled={!nextChapterEntry}
          onClick={handleNext}
        >
          Chương sau <ChevronRight size={16} />
        </button>
      </footer>

      {showToc && (
        <TocPanel
          storyId={storyId}
          sections={tocSections}
          chapters={tocChapters}
          currentChapterId={chapter.chapterId}
          readStates={tocReadStates}
          onClose={closeOverlays}
        />
      )}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          onUpdate={updateSetting}
          onClose={closeOverlays}
        />
      )}
    </div>
  );
}
