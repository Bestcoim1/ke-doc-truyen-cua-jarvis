"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPasteImport } from "@/lib/import/actions";

const INITIAL_STATE = { error: null, message: null };

export function ImportNewForm() {
  const [state, formAction, isPending] = useActionState(
    createPasteImport,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="title">Tên tác phẩm</Label>
        <Input
          id="title"
          name="title"
          maxLength={200}
          required
          autoFocus
          placeholder="Ví dụ: Thành phố sau cơn mưa"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Mô tả (không bắt buộc)</Label>
        <textarea
          id="description"
          name="description"
          maxLength={5000}
          rows={3}
          className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-base shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
          placeholder="Một ghi chú ngắn về tác phẩm"
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="content">Nội dung truyện</Label>
          <span className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            Paste text · tối đa 5 triệu ký tự
          </span>
        </div>
        <textarea
          id="content"
          name="content"
          required
          className="min-h-[50dvh] w-full resize-y rounded-xl border bg-transparent px-4 py-3 font-serif text-base leading-7 shadow-sm outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring sm:min-h-[28rem]"
          placeholder={`Hồi 1: Khởi đầu\n\nChương 1: Cuộc gặp gỡ\n\nNội dung chương...`}
        />
        <p
          className="text-xs leading-5"
          style={{ color: "var(--kd-text-muted)" }}
        >
          Hỗ trợ Chương, Chapter, Ngoại truyện, Hồi, Phần, Quyển, Arc, Part và
          Volume. Bạn sẽ được sửa lại cấu trúc trước khi lưu.
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
          {isPending ? "Đang tách chương…" : "Tự tách chương"}
        </Button>
      </div>
    </form>
  );
}
