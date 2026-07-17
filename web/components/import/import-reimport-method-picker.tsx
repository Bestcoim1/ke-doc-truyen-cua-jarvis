"use client";

import { useState } from "react";

import { ImportReimportFileForm } from "@/components/import/import-reimport-file-form";
import { ImportReimportGoogleDocsForm } from "@/components/import/import-reimport-google-docs-form";
import { ImportReimportPasteForm } from "@/components/import/import-reimport-paste-form";
import { Button } from "@/components/ui/button";
import type { ReimportMode } from "@/lib/import/reimport-mode";

type Method = "paste" | "file" | "gdoc";

export function ImportReimportMethodPicker({
  storyId,
  storyTitle,
}: {
  storyId: string;
  storyTitle: string;
}) {
  const [method, setMethod] = useState<Method>("paste");
  const [mode, setMode] = useState<ReimportMode>("append");

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Bạn muốn làm gì?</legend>
        <button
          type="button"
          onClick={() => setMode("append")}
          className="rounded-xl border p-4 text-left transition-colors"
          style={{
            borderColor:
              mode === "append" ? "var(--kd-gilt)" : "var(--kd-border)",
            background:
              mode === "append" ? "var(--kd-surface-raised)" : "transparent",
          }}
          aria-pressed={mode === "append"}
        >
          <span className="block font-bold">Nối tiếp tác phẩm</span>
          <span className="mt-1 block text-xs leading-5" style={{ color: "var(--kd-text-muted)" }}>
            Thêm các chương mới vào cuối, giữ nguyên toàn bộ chương hiện có.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("update")}
          className="rounded-xl border p-4 text-left transition-colors"
          style={{
            borderColor:
              mode === "update" ? "var(--kd-gilt)" : "var(--kd-border)",
            background:
              mode === "update" ? "var(--kd-surface-raised)" : "transparent",
          }}
          aria-pressed={mode === "update"}
        >
          <span className="block font-bold">Cập nhật chương đã có</span>
          <span className="mt-1 block text-xs leading-5" style={{ color: "var(--kd-text-muted)" }}>
            So sánh, ánh xạ và tạo phiên bản mới cho nội dung đã tồn tại.
          </span>
        </button>
      </fieldset>

      <div
        className="flex flex-wrap w-fit gap-1 rounded-lg border p-1"
        style={{ borderColor: "var(--kd-border)" }}
      >
        <Button
          type="button"
          size="sm"
          variant={method === "paste" ? "default" : "ghost"}
          onClick={() => setMethod("paste")}
        >
          Paste text
        </Button>
        <Button
          type="button"
          size="sm"
          variant={method === "file" ? "default" : "ghost"}
          onClick={() => setMethod("file")}
        >
          Tải file lên
        </Button>
        <Button
          type="button"
          size="sm"
          variant={method === "gdoc" ? "default" : "ghost"}
          onClick={() => setMethod("gdoc")}
        >
          Google Docs
        </Button>
      </div>
      {method === "paste" ? (
        <ImportReimportPasteForm storyId={storyId} storyTitle={storyTitle} mode={mode} />
      ) : method === "file" ? (
        <ImportReimportFileForm storyId={storyId} storyTitle={storyTitle} mode={mode} />
      ) : (
        <ImportReimportGoogleDocsForm storyId={storyId} storyTitle={storyTitle} mode={mode} />
      )}
    </div>
  );
}
