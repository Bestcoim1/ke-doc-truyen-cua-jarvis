import { useCallback, useState } from "react";

import type { ContentOp, ReviewDraft } from "@/lib/import/review-draft";

// Undo/redo + the ops that need syncing to the server (see toStructure /
// applyReviewSubmission — the server never receives contentText, only ids
// and the merge/split ops needed to derive it from what's already stored).
// pendingOps travels with the draft it belongs to so undo/redo can't get
// them out of sync; a successful save/commit resets the whole stack since
// the server has now baked those ops into its own stored draft. Shared by
// import-review-editor.tsx (first-time import) and
// import-reimport-editor.tsx (re-import) — identical semantics either way.
type HistoryEntry = { draft: ReviewDraft; pendingOps: ContentOp[] };
type HistoryState = { stack: HistoryEntry[]; index: number };

export function useDraftHistory(initialDraft: ReviewDraft) {
  const [history, setHistory] = useState<HistoryState>({
    stack: [{ draft: initialDraft, pendingOps: [] }],
    index: 0,
  });

  const current = history.stack[history.index];

  const apply = useCallback(
    (updater: (draft: ReviewDraft) => ReviewDraft, op?: ContentOp) => {
      setHistory((prev) => {
        const entry = prev.stack[prev.index];
        const nextDraft = updater(entry.draft);
        if (nextDraft === entry.draft) return prev;
        const nextPendingOps = op ? [...entry.pendingOps, op] : entry.pendingOps;
        const truncated = prev.stack.slice(0, prev.index + 1);
        const nextStack = [...truncated, { draft: nextDraft, pendingOps: nextPendingOps }];
        return { stack: nextStack, index: nextStack.length - 1 };
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setHistory((prev) => (prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev));
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) =>
      prev.index < prev.stack.length - 1 ? { ...prev, index: prev.index + 1 } : prev,
    );
  }, []);

  const reset = useCallback((draft: ReviewDraft) => {
    setHistory({ stack: [{ draft, pendingOps: [] }], index: 0 });
  }, []);

  return {
    draft: current.draft,
    pendingOps: current.pendingOps,
    canUndo: history.index > 0,
    canRedo: history.index < history.stack.length - 1,
    apply,
    undo,
    redo,
    reset,
  };
}
