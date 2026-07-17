"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronRight, ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";
import { getStoryForOfflineDownload } from "@/lib/reader/actions";
import { saveStoryForOffline, saveChapterForOffline } from "@/lib/offline/storage";
import { parseChapterContent } from "@/lib/reader/content";

import {
  buildTocTree,
  type ChapterRow,
  type SectionRow,
  type TocNode,
} from "@/lib/reader/tree";

type ReadState = {
  maxProgressPct: number;
  completedContentHash: string | null;
};

function SectionBranch({
  node,
  depth,
  currentChapterId,
  readStates,
  filter,
  onNavigate,
}: {
  node: TocNode;
  depth: number;
  currentChapterId: string;
  readStates: Record<string, ReadState>;
  filter: string;
  onNavigate: (chapterId: string) => void;
}) {
  const containsCurrent = useMemo(
    () => nodeContainsChapter(node, currentChapterId),
    [node, currentChapterId],
  );
  const [manuallyExpanded, setManuallyExpanded] = useState<boolean | null>(
    null,
  );
  // The branch holding the current chapter is always shown expanded; once
  // the reader explicitly toggles a branch we respect that choice instead
  // (derived-during-render, not synced via a setState-in-effect).
  const expanded = manuallyExpanded ?? containsCurrent;

  if (node.kind === "chapter") {
    if (filter && !node.title.toLowerCase().includes(filter.toLowerCase()))
      return null;
    const isCurrent = node.id === currentChapterId;
    const state = readStates[node.id];
    const label = isCurrent
      ? "Đang đọc"
      : state?.completedContentHash
        ? "Đã đọc"
        : state
          ? "Đang đọc"
          : "Chưa đọc";

    return (
      <button
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
        style={
          isCurrent
            ? {
                background: "var(--kd-accent)",
                color: "var(--kd-accent-foreground)",
              }
            : undefined
        }
        aria-current={isCurrent ? "true" : undefined}
        onClick={() => onNavigate(node.id)}
      >
        <span aria-hidden className="text-xs">
          {isCurrent ? "●" : state?.completedContentHash ? "✓" : "○"}
        </span>
        <span className="flex-1 truncate">{node.title}</span>
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      <button
        className="flex w-full items-center gap-1 px-2 py-1.5 text-xs font-bold uppercase tracking-wide"
        style={{ color: "var(--kd-text-muted)" }}
        onClick={() => setManuallyExpanded((v) => !(v ?? containsCurrent))}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {node.title}
      </button>
      {expanded && (
        <div>
          {node.children.map((child) => (
            <SectionBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              currentChapterId={currentChapterId}
              readStates={readStates}
              filter={filter}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function nodeContainsChapter(node: TocNode, chapterId: string): boolean {
  if (node.kind === "chapter") return node.id === chapterId;
  return node.children.some((child) => nodeContainsChapter(child, chapterId));
}

export function TocPanel({
  userId,
  storyId,
  sections,
  chapters,
  currentChapterId,
  readStates,
  onClose,
}: {
  userId: string;
  storyId: string;
  sections: SectionRow[];
  chapters: ChapterRow[];
  currentChapterId: string;
  readStates: Record<string, ReadState>;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const tree = useMemo(
    () => buildTocTree(sections, chapters),
    [sections, chapters],
  );
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = contentRef.current?.querySelector('[aria-current="true"]');
    current?.scrollIntoView({ block: "center" });
  }, []);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ total: number; done: number } | null>(null);

  const handleDownloadOffline = async () => {
    setIsDownloading(true);
    setDownloadProgress({ total: 100, done: 0 }); // Indeterminate at first
    try {
      const data = await getStoryForOfflineDownload(storyId);
      setDownloadProgress({ total: data.chapters.length, done: 0 });
      
      const { story, sections, chapters, revisions, annotations } = data;
      
      await saveStoryForOffline(userId, {
        storyId,
        storyTitle: story.title,
        coverImageUrl: story.cover_image_url,
        sections,
        chapters,
        lastSyncedAt: Date.now(),
      });

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        if (!chapter.current_revision_id) continue;
        const revision = revisions.find(r => r.id === chapter.current_revision_id);
        if (!revision || !revision.content_blocks) continue;

        const chapterAnns = annotations.filter(a => a.chapter_id === chapter.id);
        
        const content = parseChapterContent(revision.content_blocks);
        if (!content) continue;

        await saveChapterForOffline(userId, storyId, {
          chapterId: chapter.id,
          revisionId: revision.id,
          contentHash: revision.content_hash,
          blocks: content.blocks,
          annotations: chapterAnns,
        });
        setDownloadProgress({ total: chapters.length, done: i + 1 });
      }

      toast.success("Tải xuống thành công để đọc Offline!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Lỗi tải truyện: ${message}`);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  function handleNavigate(chapterId: string) {
    onClose();
    // Full navigation, not router.push() — see reader-view.tsx's
    // goToChapter for why (client Router Cache staleness across
    // [chapterId] param changes on the same page template).
    window.location.href = `/read/${storyId}/${chapterId}`;
  }

  return (
    <Dialog.Root open onOpenChange={(open: boolean) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-black/40" />
        <Dialog.Content
          ref={contentRef}
          aria-describedby={undefined}
          className="fixed right-0 top-0 bottom-0 z-30 flex w-[85%] max-w-sm flex-col shadow-xl outline-none"
          style={{ background: "var(--kd-surface)", color: "var(--kd-text)" }}
        >
          <div
            className="flex items-center justify-between border-b px-4 py-3 gap-2"
            style={{ borderColor: "var(--kd-border)" }}
          >
            <Dialog.Title asChild>
              <span className="text-base font-bold flex-1">Mục lục</span>
            </Dialog.Title>
            
            <button
              onClick={handleDownloadOffline}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
              title="Tải truyện về máy để đọc Offline"
            >
              {isDownloading ? (
                <span>
                  {downloadProgress && downloadProgress.total > 0
                    ? `${downloadProgress.done}/${downloadProgress.total}`
                    : "Đang tải..."}
                </span>
              ) : (
                <>
                  <Download size={14} /> Tải Offline
                </>
              )}
            </button>

            <Dialog.Close asChild>
              <button
                aria-label="Đóng"
                className="flex h-11 w-11 items-center justify-center rounded-md shrink-0"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {chapters.length >= 100 && (
            <div className="px-4 pt-3">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Tìm chương..."
                aria-label="Tìm chương"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--kd-border)",
                  background: "var(--kd-bg)",
                }}
              />
            </div>
          )}
          <div
            className="flex-1 overflow-y-auto p-2"
            style={{
              paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
            }}
          >
            {tree.map((node) => (
              <SectionBranch
                key={node.id}
                node={node}
                depth={0}
                currentChapterId={currentChapterId}
                readStates={readStates}
                filter={filter}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
