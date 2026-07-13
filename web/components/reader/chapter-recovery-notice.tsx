import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Shown when a chapter's stored content can't be rendered (an old/corrupt
 * content_blocks shape). FR-12: a clear explanation plus a next action —
 * never a blank screen. The rest of the story is unaffected, so we point
 * back to the library and offer a re-import, and keep the surrounding
 * chapters reachable.
 */
export function ChapterRecoveryNotice({
  storyId,
  storyTitle,
  chapterTitle,
}: {
  storyId: string;
  storyTitle: string;
  chapterTitle: string;
}) {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "var(--kd-bg)", color: "var(--kd-text)" }}
    >
      <div className="max-w-md">
        <h1 className="text-lg font-bold">Không mở được chương này</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Dữ liệu của “{chapterTitle}” trong “{storyTitle}” không đọc được (có thể
          từ một bản lưu cũ). Các chương khác vẫn mở bình thường. Hãy nhập lại tác
          phẩm để khôi phục chương này.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href={`/import/reimport/${storyId}/new`}>Nhập lại tác phẩm</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/library">Về thư viện</Link>
        </Button>
      </div>
    </div>
  );
}
