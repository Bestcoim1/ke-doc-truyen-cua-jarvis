"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFileReimportJob } from "@/lib/import/reimport-actions";
import type { ReimportMode } from "@/lib/import/reimport-mode";

const INITIAL_STATE = { error: null, message: null };
const MAX_UPLOAD_MB = 15;

export function ImportReimportFileForm({
  storyId,
  storyTitle,
  mode,
}: {
  storyId: string;
  storyTitle: string;
  mode: ReimportMode;
}) {
  const [state, formAction, isPending] = useActionState(
    createFileReimportJob,
    INITIAL_STATE,
  );
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="reimportMode" value={mode} />

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="file">
            Bản thảo mới cho &ldquo;{storyTitle}&rdquo;
          </Label>
          <span className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            .txt hoặc .docx · tối đa {MAX_UPLOAD_MB}MB
          </span>
        </div>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".txt,.docx"
          required
          autoFocus
          onChange={(event) =>
            setFileName(event.target.files?.[0]?.name ?? null)
          }
        />
        {fileName ? (
          <p className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            Đã chọn: {fileName}
          </p>
        ) : null}
        <p
          className="text-xs leading-5"
          style={{ color: "var(--kd-text-muted)" }}
        >
          File .txt phải là UTF-8. File .docx dùng style Heading 1/Heading 2
          trong Word sẽ được nhận làm Hồi/Chương chính xác hơn — kể cả khi paste
          text không nhận ra được, vì thao tác paste không giữ lại style của
          Word.
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          asChild
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
        >
          <Link href="/library">Hủy</Link>
        </Button>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending
            ? "Đang xử lý…"
            : mode === "append"
              ? "Review các chương nối tiếp"
              : "So sánh với bản hiện tại"}
        </Button>
      </div>
    </form>
  );
}
