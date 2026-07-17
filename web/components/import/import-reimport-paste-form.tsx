"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { createPasteReimportJob } from "@/lib/import/reimport-actions";
import type { ReimportMode } from "@/lib/import/reimport-mode";

const INITIAL_STATE = { error: null, message: null };

export function ImportReimportPasteForm({
  storyId,
  storyTitle,
  mode,
}: {
  storyId: string;
  storyTitle: string;
  mode: ReimportMode;
}) {
  const [state, formAction, isPending] = useActionState(
    createPasteReimportJob,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="reimportMode" value={mode} />

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor="content" className="text-sm font-medium">
            Bản thảo mới cho &ldquo;{storyTitle}&rdquo;
          </label>
          <span className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            Paste text · tối đa 5 triệu ký tự
          </span>
        </div>
        <textarea
          id="content"
          name="content"
          required
          autoFocus
          className="min-h-[50dvh] w-full resize-y rounded-xl border bg-transparent px-4 py-3 font-serif text-base leading-7 shadow-sm outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring sm:min-h-[28rem]"
          placeholder={`Hồi 1: Khởi đầu\n\nChương 1: Cuộc gặp gỡ\n\nNội dung chương...`}
        />
        <p
          className="text-xs leading-5"
          style={{ color: "var(--kd-text-muted)" }}
        >
          {mode === "append"
            ? "Ở bước sau, bạn có thể kiểm tra và chỉnh lại thứ tự các chương mới trước khi nối chúng vào cuối tác phẩm. Chương hiện có sẽ không bị thay đổi."
            : "Ở bước sau, hệ thống sẽ so sánh bản này với nội dung hiện tại của tác phẩm — chương nào không đổi sẽ giữ nguyên, chương nào sửa nội dung sẽ có bản mới, chương biến mất sẽ cần bạn xác nhận trước khi lưu trữ."}
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
