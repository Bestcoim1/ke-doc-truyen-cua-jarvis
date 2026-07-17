"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { cancelImportJob } from "@/lib/import/actions";
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

export function CancelJobButton({ jobId }: { jobId: string }) {
  const formId = useId();
  const [state, formAction, isPending] = useActionState(
    cancelImportJob,
    INITIAL_STATE,
  );

  return (
    <form id={formId} action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
          >
            {isPending ? "Đang hủy…" : "Hủy bản nháp"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="border-[var(--kd-border)] bg-[var(--kd-surface)] text-[var(--kd-text)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy bản nháp này?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--kd-text-muted)]">
              Nội dung chưa commit sẽ mất. Hành động này không thể khôi phục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--kd-border)] bg-transparent hover:bg-[var(--kd-border)] hover:text-[var(--kd-text)]">
              Quay lại
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              form={formId}
              disabled={isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Hủy bản nháp
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
