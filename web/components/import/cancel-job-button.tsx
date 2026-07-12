"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { cancelImportJob } from "@/lib/import/actions";

const INITIAL_STATE = { error: null, message: null };

export function CancelJobButton({ jobId }: { jobId: string }) {
  const [state, formAction, isPending] = useActionState(cancelImportJob, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={(event) => {
          if (!window.confirm("Hủy bản nháp này? Nội dung chưa commit sẽ mất.")) {
            event.preventDefault();
          }
        }}
      >
        {isPending ? "Đang hủy…" : "Hủy bản nháp"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
