import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, FolderTree, Search, TextSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { searchLibrary, type SearchResult } from "@/lib/search/queries";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { getWritingStatusMeta } from "@/lib/writing-status";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
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

  const { q } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/auth/login?next=/search");

  const dataForSearch = await searchLibrary(supabase, userId, q ?? "");
  const hasQuery = dataForSearch.query.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--kd-gilt)" }}
        >
          Tìm trong kệ
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Search
        </h1>
        <p
          className="mt-3 max-w-2xl text-sm leading-6"
          style={{ color: "var(--kd-text-muted)" }}
        >
          Tìm tác phẩm, hồi, quyển, arc, section hoặc chương rồi mở thẳng vào
          reader.
        </p>
      </div>

      <form action="/search" className="mt-6">
        <label htmlFor="library-search" className="sr-only">
          Tìm trong thư viện
        </label>
        <div
          className="flex items-center gap-3 rounded-3xl border px-4 py-3"
          style={{
            background: "var(--kd-surface)",
            borderColor: "var(--kd-border)",
          }}
        >
          <Search size={20} style={{ color: "var(--kd-text-muted)" }} />
          <input
            id="library-search"
            name="q"
            defaultValue={dataForSearch.query}
            placeholder="Tên truyện, chương, hồi, quyển..."
            className="min-h-11 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal"
          />
          <Button className="rounded-full" type="submit">
            Tìm
          </Button>
        </div>
      </form>

      {dataForSearch.error ? (
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
        >
          Không tìm được dữ liệu thư viện. Hãy thử lại.
        </p>
      ) : hasQuery ? (
        <SearchResults
          query={dataForSearch.query}
          results={dataForSearch.results}
        />
      ) : (
        <Suggestions results={dataForSearch.suggestions} />
      )}
    </div>
  );
}

function Suggestions({ results }: { results: SearchResult[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-extrabold">Gợi ý từ thư viện</h2>
      {results.length === 0 ? (
        <EmptyState text="Chưa có tác phẩm nào để gợi ý. Thêm một bản thảo rồi quay lại đây." />
      ) : (
        <ResultList results={results} />
      )}
    </section>
  );
}

function SearchResults({
  query,
  results,
}: {
  query: string;
  results: SearchResult[];
}) {
  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold">Kết quả</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--kd-text-muted)" }}>
            {results.length} kết quả cho “{query}”
          </p>
        </div>
      </div>
      {results.length === 0 ? (
        <EmptyState text="Chưa thấy truyện, hồi, quyển hoặc chương nào khớp với từ khoá này." />
      ) : (
        <ResultList results={results} />
      )}
    </section>
  );
}

function ResultList({ results }: { results: SearchResult[] }) {
  return (
    <ul className="mt-4 grid gap-3">
      {results.map((result) => (
        <li key={`${result.kind}-${result.id}`}>
          <Link
            href={result.href}
            className="flex items-start gap-4 rounded-3xl border p-4 transition-transform hover:-translate-y-0.5"
            style={{
              background: "var(--kd-surface)",
              borderColor: "var(--kd-border)",
            }}
          >
            <ResultIcon result={result} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="line-clamp-2 font-extrabold">
                  {result.title}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{
                    background: "var(--kd-bg)",
                    color: "var(--kd-text-muted)",
                  }}
                >
                  {result.kind === "story"
                    ? getWritingStatusMeta(result.writingStatus).label
                    : result.kind === "section"
                      ? "Cấu trúc"
                      : `Chương ${result.chapterOrdinal}`}
                </span>
              </div>
              <p
                className="mt-1 truncate text-sm"
                style={{ color: "var(--kd-text-muted)" }}
              >
                {result.subtitle}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ResultIcon({ result }: { result: SearchResult }) {
  const Icon =
    result.kind === "story"
      ? BookOpen
      : result.kind === "section"
        ? FolderTree
        : TextSearch;
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      style={{
        background: "var(--kd-binding)",
        color: "var(--kd-accent-foreground)",
      }}
    >
      <Icon size={19} />
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="mt-4 rounded-3xl border p-8 text-center text-sm"
      style={{
        background: "var(--kd-surface)",
        borderColor: "var(--kd-border)",
        color: "var(--kd-text-muted)",
      }}
    >
      {text}
    </div>
  );
}
