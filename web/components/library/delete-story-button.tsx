"use client";

import { useActionState } from "react";

import { deleteStory } from "@/lib/library/actions";

const INITIAL_STATE = { error: null, message: null };

export function DeleteStoryButton({
  storyId,
  storyTitle,
}: {
  storyId: string;
  storyTitle: string;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteStory,
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
        onClick={(event) => {
          if (
            !window.confirm(
              `Xoá vĩnh viễn "${storyTitle}"? Toàn bộ chương và tiến độ đọc sẽ mất, không thể khôi phục.`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        {isPending ? "Đang xoá…" : "Xoá"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
