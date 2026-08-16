"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  reviewContinuityInboxItem,
  runLatestContinuityAnalysis,
} from "@/lib/studio/automation-actions";
import {
  EMPTY_STUDIO_ACTION_STATE,
  FACT_STATUS_LABELS,
  KNOWLEDGE_STATE_LABELS,
  type ContinuityInboxKind,
  type ContinuityAlertKind,
  type ContinuityKnowledgeState,
  type StudioActionState,
} from "@/lib/studio/types";

const FIELD_CLASS =
  "min-h-10 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 text-sm text-[var(--studio-text)]";

function ActionMessage({ state }: { state: StudioActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "basis-full text-xs text-red-600"
          : "basis-full text-xs text-emerald-700 dark:text-emerald-400"
      }
    >
      {state.message}
    </p>
  );
}

export function RunContinuityAnalysisForm({ storyId }: { storyId: string }) {
  const [state, formAction, isPending] = useActionState(
    runLatestContinuityAnalysis,
    EMPTY_STUDIO_ACTION_STATE,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="storyId" value={storyId} />
      <Button type="submit" variant="outline" disabled={isPending} className="rounded-full border-[var(--studio-border)]">
        {isPending ? "Đang phân tích…" : "Phân tích phiên bản mới nhất"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function InboxReviewForm({
  storyId,
  itemId,
  kind,
  alertKind,
  suggestedKnowledgeState,
}: {
  storyId: string;
  itemId: string;
  kind: ContinuityInboxKind;
  alertKind: ContinuityAlertKind | null;
  suggestedKnowledgeState?: ContinuityKnowledgeState;
}) {
  const [state, formAction, isPending] = useActionState(
    reviewContinuityInboxItem,
    EMPTY_STUDIO_ACTION_STATE,
  );
  const isAlert = kind === "alert";
  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-center gap-2">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="itemId" value={itemId} />
      {!isAlert ? (
        <label className="text-xs font-bold text-[var(--studio-muted)]">
          Mức chắc chắn
          <select name="recordStatus" defaultValue="inference" className={`${FIELD_CLASS} ml-2`}>
            {(["canon", "inference", "disputed"] as const).map((status) => (
              <option key={status} value={status}>{FACT_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
      ) : null}
      {kind === "knowledge_claim" ? (
        <label className="text-xs font-bold text-[var(--studio-muted)]">
          Trạng thái biết
          <select
            name="knowledgeState"
            defaultValue={suggestedKnowledgeState ?? "knows"}
            className={`${FIELD_CLASS} ml-2`}
          >
            {(Object.keys(KNOWLEDGE_STATE_LABELS) as ContinuityKnowledgeState[]).map((status) => (
              <option key={status} value={status}>{KNOWLEDGE_STATE_LABELS[status]}</option>
            ))}
          </select>
        </label>
      ) : null}
      {isAlert ? (
        <>
          <Button type="submit" name="decision" value="accepted" size="sm" disabled={isPending}>
            Xác nhận vấn đề
          </Button>
          <Button type="submit" name="decision" value="intentional" size="sm" variant="outline" disabled={isPending}>
            Có chủ ý
          </Button>
          {alertKind === "state_conflict" ? (
            <Button type="submit" name="decision" value="retcon" size="sm" variant="outline" disabled={isPending}>
              Retcon fact cũ
            </Button>
          ) : null}
        </>
      ) : (
        <Button type="submit" name="decision" value="accepted" size="sm" disabled={isPending}>
          Chấp nhận vào bộ nhớ
        </Button>
      )}
      <Button type="submit" name="decision" value="dismissed" size="sm" variant="ghost" disabled={isPending}>
        Bỏ qua
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
