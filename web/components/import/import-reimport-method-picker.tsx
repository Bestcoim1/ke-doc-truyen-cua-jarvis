"use client";

import { useState } from "react";

import { ImportReimportFileForm } from "@/components/import/import-reimport-file-form";
import { ImportReimportGoogleDocsForm } from "@/components/import/import-reimport-google-docs-form";
import { ImportReimportPasteForm } from "@/components/import/import-reimport-paste-form";
import { Button } from "@/components/ui/button";

type Method = "paste" | "file" | "gdoc";

export function ImportReimportMethodPicker({
  storyId,
  storyTitle,
}: {
  storyId: string;
  storyTitle: string;
}) {
  const [method, setMethod] = useState<Method>("paste");

  return (
    <div className="flex flex-col gap-4">
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
        <ImportReimportPasteForm storyId={storyId} storyTitle={storyTitle} />
      ) : method === "file" ? (
        <ImportReimportFileForm storyId={storyId} storyTitle={storyTitle} />
      ) : (
        <ImportReimportGoogleDocsForm storyId={storyId} storyTitle={storyTitle} />
      )}
    </div>
  );
}
