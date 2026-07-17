"use client";

import { useRef } from "react";
import { useActionState } from "react";

import { deleteStory } from "@/lib/library/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const INITIAL_STATE = { error: null, message: null };

export function DeleteStoryButton({
  storyId,
  storyTitle,
}: {
  storyId: string;
  storyTitle: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    deleteStory,
    INITIAL_STATE,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex shrink-0 flex-col items-end gap-1"
    >
      <input type="hidden" name="storyId" value={storyId} />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              className="text-xs underline disabled:opacity-50"
              style={{ color: "var(--kd-text-muted)" }}
            >
              {isPending ? "Đang xoá…" : "Xoá"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-[var(--kd-border)] bg-[var(--kd-surface)] text-[var(--kd-text)]">
            <AlertDialogHeader>
              <AlertDialogTitle>Xoá vĩnh viễn &quot;{storyTitle}&quot;?</AlertDialogTitle>
              <AlertDialogDescription className="text-[var(--kd-text-muted)]">
                Toàn bộ chương và tiến độ đọc sẽ mất, không thể khôi phục.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-[var(--kd-border)] bg-transparent hover:bg-[var(--kd-border)] hover:text-[var(--kd-text)]">
                Huỷ
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => formRef.current?.requestSubmit()}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Xoá vĩnh viễn
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

