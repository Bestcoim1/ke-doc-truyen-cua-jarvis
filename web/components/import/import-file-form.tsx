"use client";

import { ArrowDown, ArrowUp, FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFileImport } from "@/lib/import/actions";

const INITIAL_STATE = { error: null, message: null };
const MAX_UPLOAD_MB = 15;
const MAX_FILES = 20;
const MAX_TOTAL_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type SelectedFile = {
  id: string;
  file: File;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportFileForm() {
  const [state, formAction, isActionPending] = useActionState(
    createFileImport,
    INITIAL_STATE,
  );
  const [isTransitionPending, startTransition] = useTransition();
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);
  const isPending = isActionPending || isTransitionPending;
  const totalBytes = files.reduce((total, item) => total + item.file.size, 0);

  function addFiles(nextFiles: File[]) {
    setClientError(null);
    const unsupported = nextFiles.find(
      (file) => !/\.(?:txt|docx)$/iu.test(file.name),
    );
    if (unsupported) {
      setClientError(`File “${unsupported.name}” không phải TXT hoặc DOCX.`);
      return;
    }
    if (files.length + nextFiles.length > MAX_FILES) {
      setClientError(`Mỗi lần chỉ có thể nhập tối đa ${MAX_FILES} file.`);
      return;
    }
    const nextTotal =
      totalBytes + nextFiles.reduce((total, file) => total + file.size, 0);
    if (nextTotal > MAX_TOTAL_BYTES) {
      setClientError(
        `Tổng dung lượng các file không được vượt quá ${MAX_UPLOAD_MB}MB.`,
      );
      return;
    }

    setFiles((current) => [
      ...current,
      ...nextFiles.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }

  function moveFile(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= files.length) return;
    setFiles((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id));
    setClientError(null);
  }

  function submitFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setClientError("Hãy chọn ít nhất một file TXT hoặc DOCX.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    for (const { file } of files) formData.append("files", file, file.name);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={submitFiles} className="flex flex-col gap-6">
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

      <div className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="files">File truyện</Label>
          <span className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            tối đa {MAX_FILES} file · tổng {MAX_UPLOAD_MB}MB
          </span>
        </div>
        <Input
          id="files"
          type="file"
          accept=".txt,.docx"
          multiple
          disabled={isPending}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />

        {files.length > 0 ? (
          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--kd-border)" }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs font-bold"
              style={{
                borderColor: "var(--kd-border)",
                color: "var(--kd-text-muted)",
              }}
            >
              <span>Thứ tự ghép: {files.length} file</span>
              <span>{formatFileSize(totalBytes)}</span>
            </div>
            <ol className="divide-y" style={{ borderColor: "var(--kd-border)" }}>
              {files.map(({ id, file }, index) => (
                <li key={id} className="flex items-center gap-2 px-3 py-2">
                  <span
                    className="w-6 shrink-0 text-center text-xs font-extrabold"
                    style={{ color: "var(--kd-text-muted)" }}
                  >
                    {index + 1}
                  </span>
                  <FileText className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {file.name}
                  </span>
                  <span
                    className="hidden shrink-0 text-xs sm:inline"
                    style={{ color: "var(--kd-text-muted)" }}
                  >
                    {formatFileSize(file.size)}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={isPending || index === 0}
                    onClick={() => moveFile(index, -1)}
                    aria-label={`Đưa ${file.name} lên trước`}
                    title="Đưa lên"
                    className="h-8 w-8"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={isPending || index === files.length - 1}
                    onClick={() => moveFile(index, 1)}
                    aria-label={`Đưa ${file.name} xuống sau`}
                    title="Đưa xuống"
                    className="h-8 w-8"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => removeFile(id)}
                    aria-label={`Bỏ ${file.name}`}
                    title="Bỏ file"
                    className="h-8 w-8 text-red-600"
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <p
          className="text-xs leading-5"
          style={{ color: "var(--kd-text-muted)" }}
        >
          Có thể chọn nhiều lần để thêm file. Dùng nút mũi tên để đặt thứ tự
          ghép trước khi tải lên. TXT phải là UTF-8; DOCX nên dùng Heading 1/2
          cho Hồi và Chương. Bạn vẫn có thể chỉnh lại thứ tự trong màn review.
        </p>
      </div>

      {clientError || state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {clientError ?? state.error}
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
        <Button
          type="submit"
          disabled={isPending || files.length === 0}
          className="w-full sm:w-auto"
        >
          {isPending ? "Đang xử lý…" : "Tải lên và review thứ tự"}
        </Button>
      </div>
    </form>
  );
}
