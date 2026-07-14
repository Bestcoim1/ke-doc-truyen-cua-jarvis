"use client";

import { useActionState } from "react";

import { restoreStory } from "@/lib/library/actions";

const INITIAL_STATE = { error: null, message: null };

export function RestoreStoryButton({ storyId }: { storyId: string }) {
  const [state, formAction, isPending] = useActionState(
    restoreStory,
    INITIAL_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex shrink-0 flex-col items-end gap-1"
    >
      <input type="hidden" name="storyId" value={storyId} />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs underline disabled:opacity-50"
        style={{ color: "var(--kd-text-muted)" }}
      >
        {isPending ? "Đang khôi phục…" : "Khôi phục"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
