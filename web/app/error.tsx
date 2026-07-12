"use client";

import { useEffect } from "react";

import { logEvent } from "@/lib/telemetry";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logEvent("app.error", { digest: error.digest });
  }, [error.digest]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Đã có lỗi xảy ra. Vui lòng thử lại.
      </p>
      <Button onClick={reset}>Thử lại</Button>
    </main>
  );
}
