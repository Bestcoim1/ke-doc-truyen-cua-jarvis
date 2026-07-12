"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFileImport } from "@/lib/import/actions";

const INITIAL_STATE = { error: null, message: null };
const MAX_UPLOAD_MB = 15;

export function ImportFileForm() {
  const [state, formAction, isPending] = useActionState(createFileImport, INITIAL_STATE);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="file-title">Tên tác phẩm</Label>
        <Input
          id="file-title"
          name="title"
          maxLength={200}
          required
          autoFocus
          placeholder="Ví dụ: Thành phố sau cơn mưa"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="file-description">Mô tả (không bắt buộc)</Label>
        <textarea
          id="file-description"
          name="description"
          maxLength={5000}
          rows={3}
          className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-base shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
          placeholder="Một ghi chú ngắn về tác phẩm"
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="file">File truyện</Label>
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
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
        {fileName ? (
          <p className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            Đã chọn: {fileName}
          </p>
        ) : null}
        <p className="text-xs leading-5" style={{ color: "var(--kd-text-muted)" }}>
          File .txt phải là UTF-8. File .docx dùng style Heading 1/Heading 2 trong Word sẽ được
          nhận làm Hồi/Chương chính xác hơn; nếu không có style, hệ thống sẽ tự đoán theo mẫu
          Chương/Hồi giống như paste text.
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
        <Button asChild type="button" variant="outline" className="w-full sm:w-auto">
          <Link href="/library">Hủy</Link>
        </Button>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Đang xử lý…" : "Tải lên và tách chương"}
        </Button>
      </div>
    </form>
  );
}
