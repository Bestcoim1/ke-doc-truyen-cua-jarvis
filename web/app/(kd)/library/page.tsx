import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Archive, BookOpen, Clock3, ListOrdered, Network, Plus, RefreshCw } from "lucide-react";

import { ArchiveStoryButton } from "@/components/library/archive-story-button";
import { DeleteStoryButton } from "@/components/library/delete-story-button";
import { LibrarySkeleton } from "@/components/library/library-skeleton";
import { RestoreStoryButton } from "@/components/library/restore-story-button";
import { WritingStatusForm } from "@/components/library/writing-status-form";
import { StoryCoverIcon } from "@/components/library/story-cover-icon";
import { Button } from "@/components/ui/button";
import { getLibraryStories, type LibraryStory } from "@/lib/library/queries";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";
import { isSupabaseConfigured } from "@/lib/utils";
import { getWritingStatusMeta } from "@/lib/writing-status";

type LibraryPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default function LibraryPage({ searchParams }: LibraryPageProps) {
  if (!isSupabaseConfigured) {
    return (
      <p
        className="max-w-sm p-6 text-sm"
        style={{ color: "var(--kd-text-muted)" }}
      >
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LibraryContent({ searchParams }: LibraryPageProps) {
  const { status: statusParam } = await searchParams;
  const status: "active" | "archived" =
    statusParam === "archived" ? "archived" : "active";

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    redirect("/auth/login?next=/library");
  }

  const { stories, error: storiesError } = await getLibraryStories(
    supabase,
    user.sub,
    status,
  );

  if (!storiesError) {
    logEvent("library.viewed", { storyCount: stories?.length ?? 0, status });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--kd-gilt)" }}
          >
            Không gian bản thảo cá nhân
          </p>
          <h1 className="mt-2 text-4xl font-extrabold font-display tracking-tight sm:text-5xl">
            Thư viện truyện
          </h1>
          <p
            className="mt-3 max-w-2xl text-sm leading-6"
            style={{ color: "var(--kd-text-muted)" }}
          >
            Theo dõi chỗ đang đọc và cả nhịp sáng tác của từng tác phẩm trong
            cùng một kệ.
          </p>
        </div>
        <div className="grid gap-2 sm:flex sm:items-center">
          <Button
            asChild
            variant="outline"
            className="justify-center rounded-full"
          >
            <Link href="/library/graphs">
              <Network size={16} />
              Graph View
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="justify-center rounded-full"
          >
            <Link href="/import">Bản nháp đang chờ</Link>
          </Button>
          <Button asChild className="justify-center rounded-full">
            <Link href="/import/new">
              <Plus size={16} />
              Thêm tác phẩm
            </Link>
          </Button>
        </div>
      </div>

      <div
        className="mt-6 grid w-full grid-cols-2 rounded-full border p-1 sm:w-fit"
        style={{
          borderColor: "var(--kd-border)",
          background: "var(--kd-surface)",
        }}
      >
        <Link
          href="/library"
          className="rounded-full px-4 py-2 text-center text-sm font-bold transition-colors"
          style={
            status === "active"
              ? {
                  background: "var(--kd-binding)",
                  color: "var(--kd-accent-foreground)",
                }
              : { color: "var(--kd-text-muted)" }
          }
        >
          Đang đọc
        </Link>
        <Link
          href="/library?status=archived"
          className="rounded-full px-4 py-2 text-center text-sm font-bold transition-colors"
          style={
            status === "archived"
              ? {
                  background: "var(--kd-binding)",
                  color: "var(--kd-accent-foreground)",
                }
              : { color: "var(--kd-text-muted)" }
          }
        >
          Đã lưu trữ
        </Link>
      </div>

      {storiesError ? (
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
        >
          Không tải được thư viện. Hãy{" "}
          <Link href="/library" className="underline">
            thử lại
          </Link>
          .
        </p>
      ) : !stories || stories.length === 0 ? (
        <EmptyLibraryState status={status} />
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} status={status} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyLibraryState({ status }: { status: "active" | "archived" }) {
  return (
    <div
      className="mt-6 rounded-3xl border p-8 text-center"
      style={{
        background: "var(--kd-surface)",
        borderColor: "var(--kd-border)",
      }}
    >
      <BookOpen className="mx-auto h-10 w-10 opacity-35" />
      <p className="mt-4 text-sm" style={{ color: "var(--kd-text-muted)" }}>
        {status === "archived"
          ? "Chưa lưu trữ tác phẩm nào."
          : "Chưa có tác phẩm nào. Hãy thêm truyện đầu tiên bằng paste text hoặc DOCX."}
      </p>
      {status === "active" ? (
        <Button asChild className="mt-5 rounded-full">
          <Link href="/import/new">Thêm tác phẩm đầu tiên</Link>
        </Button>
      ) : null}
    </div>
  );
}

function StoryCard({
  story,
  status,
}: {
  story: LibraryStory;
  status: "active" | "archived";
}) {
  const writing = getWritingStatusMeta(story.writingStatus);
  const readingPct = story.progress?.pct ?? 0;
  const readingLabel = story.progress
    ? `Đang đọc chương ${story.progress.currentOrdinal}/${story.progress.totalChapters}`
    : story.lastReadAt
      ? "Đã mở đọc"
      : "Chưa đọc";

  return (
    <li
      className="group/card relative flex flex-col overflow-hidden rounded-3xl border transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
      style={{
        background:
          "linear-gradient(145deg, var(--kd-surface-raised), color-mix(in srgb, var(--kd-surface) 86%, var(--kd-gilt)))",
        borderColor: "var(--kd-border)",
        boxShadow: "0 4px 20px -5px color-mix(in srgb, var(--kd-gilt) 20%, transparent)",
      }}
    >
      {/* Invisible link overlay covering the whole card */}
      {status === "active" && (
        <Link href={`/read/${story.id}`} className="absolute inset-0 z-10 rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="sr-only">Đọc {story.title}</span>
        </Link>
      )}

      <div className="relative flex flex-1 flex-col p-5 pointer-events-none">
        <div className="flex items-start gap-4">
          <div className="pointer-events-auto relative z-20">
            <StoryCoverIcon storyId={story.id} initialCoverUrl={story.coverImageUrl} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-xl font-extrabold font-display leading-tight transition-colors group-hover/card:text-primary">
              {story.title}
            </h2>
            <div
              className="mt-2 flex flex-wrap items-center gap-2 text-xs"
              style={{ color: "var(--kd-text-muted)" }}
            >
              <span>{story.chapterCount} chương</span>
              <span aria-hidden>·</span>
              <span>{readingLabel}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <ProgressRow
            label="Tiến trình đọc"
            pct={readingPct}
            value={`${readingPct}%`}
          />
          <ProgressRow
            label="Tiến trình sáng tác"
            pct={writing.progressPct}
            value={writing.label}
          />
        </div>

        {status === "active" ? (
          <div className="mt-5 pointer-events-auto relative z-20">
            <WritingStatusForm
              storyId={story.id}
              writingStatus={story.writingStatus}
            />
          </div>
        ) : (
          <div
            className="mt-5 inline-flex w-fit rounded-full border px-3 py-1 text-xs font-bold"
            style={{
              borderColor: "var(--kd-border)",
              color: "var(--kd-text-muted)",
            }}
          >
            {writing.label}
          </div>
        )}
      </div>

      <div
        className="relative z-10 pointer-events-auto flex flex-wrap items-center gap-3 border-t px-5 py-3 text-xs"
        style={{
          borderColor: "var(--kd-border)",
          background: "color-mix(in srgb, var(--kd-surface) 72%, transparent)",
        }}
      >
        {status === "active" ? (
          <>
            <Link
              href={`/read/${story.id}/graph`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-bold"
              style={{
                background: "var(--kd-bg)",
                color: "var(--kd-text)",
              }}
            >
              <Network size={14} />
              Graph
            </Link>
            <Link
              href={`/import/reimport/${story.id}/new`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-bold"
              style={{ background: "var(--kd-bg)", color: "var(--kd-text)" }}
            >
              <RefreshCw size={14} />
              Cập nhật bản thảo
            </Link>
            <Link
              href={`/library/${story.id}/chapters`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-bold"
              style={{ color: "var(--kd-text-muted)" }}
            >
              <ListOrdered size={14} />
              Sắp xếp chương
            </Link>
            <a
              href={`/api/export/epub?storyId=${story.id}`}
              download
              className="text-xs font-bold transition-colors hover:text-blue-600"
              style={{ color: "var(--kd-text-muted)" }}
            >
              Tải EPUB
            </a>
            <ArchiveStoryButton storyId={story.id} />
          </>
        ) : (
          <div className="inline-flex items-center gap-2">
            <Archive size={14} />
            <RestoreStoryButton storyId={story.id} />
          </div>
        )}
        <div className="ml-auto">
          <DeleteStoryButton storyId={story.id} storyTitle={story.title} />
        </div>
      </div>
    </li>
  );
}

function ProgressRow({
  label,
  pct,
  value,
}: {
  label: string;
  pct: number;
  value: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold">
        <span
          className="inline-flex items-center gap-1.5"
          style={{ color: "var(--kd-text-muted)" }}
        >
          <Clock3 size={13} />
          {label}
        </span>
        <span>{value}</span>
      </div>
      <div
        className="h-2.5 rounded-full"
        style={{
          background: "color-mix(in srgb, var(--kd-border) 60%, transparent)",
        }}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background:
              "linear-gradient(90deg, var(--kd-binding), var(--kd-gilt))",
          }}
        />
      </div>
    </div>
  );
}
