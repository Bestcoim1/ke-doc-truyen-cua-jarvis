"use client";

import { useState } from "react";

import { ImportFileForm } from "@/components/import/import-file-form";
import { ImportNewForm } from "@/components/import/import-new-form";
import { Button } from "@/components/ui/button";

type Method = "paste" | "file";

export function ImportMethodPicker() {
  const [method, setMethod] = useState<Method>("paste");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-lg border p-1" style={{ borderColor: "var(--kd-border)" }}>
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
      </div>
      {method === "paste" ? <ImportNewForm /> : <ImportFileForm />}
    </div>
  );
}
