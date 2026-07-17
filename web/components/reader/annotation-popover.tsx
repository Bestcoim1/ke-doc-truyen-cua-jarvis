"use client";

import { useEffect, useState, useRef } from "react";
import { Check, Edit2, Trash } from "lucide-react";
import { getSelectionOffsets } from "@/lib/reader/selection";

import type { ChapterAnnotationRow } from "@/lib/reader/queries";

export type SelectionData = {
  anchorId: string;
  startOffset: number;
  endOffset: number;
  rect: DOMRect;
  existingId?: string;
};

const COLORS = [
  { value: "var(--kd-accent)", label: "Yellow" },
  { value: "#ffb6c1", label: "Pink" },
  { value: "#98fb98", label: "Green" },
  { value: "#87cefa", label: "Blue" },
];

export function AnnotationPopover({
  containerRef,
  onHighlight,
  onUpdate,
  onDelete,
  annotations,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onHighlight: (
    anchorId: string,
    start: number,
    end: number,
    color: string,
    note?: string
  ) => void;
  onUpdate: (id: string, color: string, note?: string) => void;
  onDelete: (id: string) => void;
  annotations: ChapterAnnotationRow[];
}) {
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !containerRef.current) {
        // Do not clear immediately on collapse to allow clicking inside popover
        return;
      }

      const range = sel.getRangeAt(0);
      
      // Ensure selection is inside a block
      let anchorNode = range.commonAncestorContainer;
      if (anchorNode.nodeType === Node.TEXT_NODE) {
        anchorNode = anchorNode.parentNode as Node;
      }
      
      const blockEl = (anchorNode as Element).closest("[data-anchor-id]");
      if (!blockEl || !containerRef.current.contains(blockEl)) {
        return;
      }

      const anchorId = blockEl.getAttribute("data-anchor-id");
      if (!anchorId) return;

      const offsets = getSelectionOffsets(blockEl as HTMLElement, range);
      if (!offsets) return;

      const rect = range.getBoundingClientRect();
      
      setSelection({
        anchorId,
        startOffset: offsets.start,
        endOffset: offsets.end,
        rect,
      });
      setShowNote(false);
      setNote("");
    };

    const handleMarkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest("mark[data-annotation-id]");
      if (mark && containerRef.current?.contains(mark)) {
        const annId = mark.getAttribute("data-annotation-id");
        const existingAnn = annotations.find(a => a.id === annId);
        if (existingAnn && annId) {
          setSelection({
            anchorId: existingAnn.anchor_id,
            startOffset: existingAnn.start_offset,
            endOffset: existingAnn.end_offset,
            rect: mark.getBoundingClientRect(),
            existingId: annId,
          });
          setSelectedColor(existingAnn.color || COLORS[0].value);
          setNote(existingAnn.note || "");
          setShowNote(!!existingAnn.note);
          // clear window selection to avoid conflict
          window.getSelection()?.removeAllRanges();
        }
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("click", handleMarkClick);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("click", handleMarkClick);
    };
  }, [containerRef, annotations]);

  // Hide on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setSelection(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!selection) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 flex flex-col gap-2 rounded-xl p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      style={{
        background: "var(--kd-surface)",
        border: "1px solid var(--kd-border)",
        top: Math.max(10, selection.rect.top - 60) + "px",
        left: Math.max(10, selection.rect.left + selection.rect.width / 2 - 100) + "px",
      }}
    >
      {showNote ? (
        <div className="flex flex-col gap-2 w-64 p-1">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú của bạn..."
            className="w-full rounded-md border p-2 text-sm outline-none focus:border-primary"
            style={{
              background: "var(--kd-bg)",
              borderColor: "var(--kd-border)",
              color: "var(--kd-text)",
            }}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowNote(false)}
              className="px-3 py-1 text-xs font-semibold rounded-md border"
              style={{ borderColor: "var(--kd-border)", color: "var(--kd-text)" }}
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (selection.existingId) {
                  onUpdate(selection.existingId, selectedColor, note);
                } else {
                  onHighlight(
                    selection.anchorId,
                    selection.startOffset,
                    selection.endOffset,
                    selectedColor,
                    note
                  );
                }
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="px-3 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground"
            >
              Lưu
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-1">
          <div className="flex gap-1.5 mr-2">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setSelectedColor(c.value)}
                className="h-6 w-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                style={{ backgroundColor: c.value }}
                title={c.label}
              >
                {selectedColor === c.value && <Check size={14} color="#000" />}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border mx-1" style={{ background: "var(--kd-border)" }} />
          <button
            onClick={() => {
              if (selection.existingId) {
                onUpdate(selection.existingId, selectedColor, note);
              } else {
                onHighlight(
                  selection.anchorId,
                  selection.startOffset,
                  selection.endOffset,
                  selectedColor
                );
              }
              setSelection(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="px-3 py-1 text-xs font-bold rounded-full hover:opacity-80 transition-opacity"
            style={{ background: selectedColor, color: "#000" }}
          >
            {selection.existingId ? "Cập nhật" : "Đánh dấu"}
          </button>
          <button
            onClick={() => setShowNote(true)}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground transition-colors"
            title="Thêm ghi chú"
          >
            <Edit2 size={16} />
          </button>
          {selection.existingId && (
            <>
              <div className="w-px h-5 bg-border mx-1" style={{ background: "var(--kd-border)" }} />
              <button
                onClick={() => {
                  if (selection.existingId) {
                    onDelete(selection.existingId);
                  }
                  setSelection(null);
                }}
                className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-destructive transition-colors"
                title="Xóa đánh dấu"
              >
                <Trash size={16} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
