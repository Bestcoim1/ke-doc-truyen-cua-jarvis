"use client";

import { useActionState } from "react";

import { archiveStory } from "@/lib/library/actions";

const INITIAL_STATE = { error: null, message: null };

export function ArchiveStoryButton({ storyId }: { storyId: string }) {
  const [state, formAction, isPending] = useActionState(
    archiveStory,
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
        {isPending ? "Đang lưu trữ…" : "Lưu trữ"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
