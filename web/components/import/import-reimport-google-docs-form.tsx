"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGoogleDocsReimportJob } from "@/lib/import/reimport-actions";
import type { ReimportMode } from "@/lib/import/reimport-mode";

const INITIAL_STATE = { error: null, message: null };

export function ImportReimportGoogleDocsForm({
  storyId,
  storyTitle,
  mode,
}: {
  storyId: string;
  storyTitle: string;
  mode: ReimportMode;
}) {
  const [state, formAction, isPending] = useActionState(
    createGoogleDocsReimportJob,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="reimportMode" value={mode} />

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="gdoc-url">
            Link bản thảo mới cho &ldquo;{storyTitle}&rdquo;
          </Label>
        </div>
        <Input
          id="gdoc-url"
          name="url"
          type="url"
          required
          autoFocus
          placeholder="https://docs.google.com/document/d/..."
        />
        <p
          className="text-xs leading-5"
          style={{ color: "var(--kd-text-muted)" }}
        >
          Hãy chắc chắn rằng tài liệu của bạn đã được bật chế độ chia sẻ <strong>&quot;Bất kỳ ai có liên kết đều có thể xem&quot; (Anyone with the link can view)</strong>. Tài liệu sẽ được tải ngầm dưới định dạng .docx.
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
