"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGoogleDocsImport } from "@/lib/import/actions";

const INITIAL_STATE = { error: null, message: null };

export function ImportGoogleDocsForm() {
  const [state, formAction, isPending] = useActionState(
    createGoogleDocsImport,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="gdoc-title">Tên tác phẩm</Label>
        <Input
          id="gdoc-title"
          name="title"
          maxLength={200}
          required
          autoFocus
          placeholder="Ví dụ: Thành phố sau cơn mưa"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="gdoc-description">Mô tả (không bắt buộc)</Label>
        <textarea
          id="gdoc-description"
          name="description"
          maxLength={5000}
          rows={3}
          className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-base shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
          placeholder="Một ghi chú ngắn về tác phẩm"
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="gdoc-url">Đường link Google Docs</Label>
        </div>
        <Input
          id="gdoc-url"
          name="url"
          type="url"
          required
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
          {isPending ? "Đang xử lý…" : "Tải về và tách chương"}
        </Button>
      </div>
    </form>
  );
}
