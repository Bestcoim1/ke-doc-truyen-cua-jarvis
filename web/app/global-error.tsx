"use client";

import { useEffect } from "react";

import { logEvent } from "@/lib/telemetry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logEvent("app.global_error", { digest: error.digest });
  }, [error.digest]);

  return (
    <html lang="vi">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Đã có lỗi nghiêm trọng xảy ra. Vui lòng thử lại.
          </p>
          <button
            onClick={reset}
            className="rounded-md border px-4 py-2 text-sm"
          >
            Thử lại
          </button>
        </main>
      </body>
    </html>
  );
}
