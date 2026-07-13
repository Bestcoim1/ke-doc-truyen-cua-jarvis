"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronRight, ChevronDown } from "lucide-react";

import { buildTocTree, type ChapterRow, type SectionRow, type TocNode } from "@/lib/reader/tree";

type ReadState = { maxProgressPct: number; completedContentHash: string | null };

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
  const containsCurrent = useMemo(() => nodeContainsChapter(node, currentChapterId), [node, currentChapterId]);
  const [manuallyExpanded, setManuallyExpanded] = useState<boolean | null>(null);
  // The branch holding the current chapter is always shown expanded; once
  // the reader explicitly toggles a branch we respect that choice instead
  // (derived-during-render, not synced via a setState-in-effect).
  const expanded = manuallyExpanded ?? containsCurrent;

  if (node.kind === "chapter") {
    if (filter && !node.title.toLowerCase().includes(filter.toLowerCase())) return null;
    const isCurrent = node.id === currentChapterId;
    const state = readStates[node.id];
    const label = isCurrent ? "Đang đọc" : state?.completedContentHash ? "Đã đọc" : state ? "Đang đọc" : "Chưa đọc";

    return (
      <button
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
        style={isCurrent ? { background: "var(--kd-accent)", color: "var(--kd-accent-foreground)" } : undefined}
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
  storyId,
  sections,
  chapters,
  currentChapterId,
  readStates,
  onClose,
}: {
  storyId: string;
  sections: SectionRow[];
  chapters: ChapterRow[];
  currentChapterId: string;
  readStates: Record<string, ReadState>;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const tree = useMemo(() => buildTocTree(sections, chapters), [sections, chapters]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = contentRef.current?.querySelector('[aria-current="true"]');
    current?.scrollIntoView({ block: "center" });
  }, []);

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
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--kd-border)" }}>
            <Dialog.Title asChild>
              <span className="text-base font-bold">Mục lục</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Đóng"
                className="flex h-11 w-11 items-center justify-center rounded-md"
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
                style={{ borderColor: "var(--kd-border)", background: "var(--kd-bg)" }}
              />
            </div>
          )}
          <div
            className="flex-1 overflow-y-auto p-2"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
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
