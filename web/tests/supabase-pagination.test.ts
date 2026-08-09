import { describe, expect, it, vi } from "vitest";

import {
  chunkValues,
  fetchAllPages,
  fetchAllValueChunks,
} from "@/lib/supabase/pagination";

describe("Supabase pagination", () => {
  it("collects every row across the 1,000-row API boundary", async () => {
    const source = Array.from({ length: 2_005 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));

    const result = await fetchAllPages(fetchPage);

    expect(result).toEqual({ data: source, error: null });
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("does not return a partial collection when a later page fails", async () => {
    const error = { code: "query_failed" };
    const result = await fetchAllPages((from) =>
      Promise.resolve(from === 0 ? { data: Array(1000).fill(1), error: null } : { data: null, error }),
    );
    expect(result).toEqual({ data: null, error });
  });

  it("chunks large IN filters to keep request URLs bounded", () => {
    expect(chunkValues(Array.from({ length: 405 }, (_, id) => id))).toHaveLength(3);
  });

  it("collects paginated rows for every bounded value chunk", async () => {
    const values = Array.from({ length: 405 }, (_, id) => id);
    const seenChunks: number[][] = [];
    const result = await fetchAllValueChunks(
      values,
      async (chunk) => {
        seenChunks.push([...chunk]);
        return { data: chunk.map((id) => ({ id })), error: null };
      },
    );
    expect(result.data).toHaveLength(405);
    expect(seenChunks.map((chunk) => chunk.length)).toEqual([200, 200, 5]);
  });
});
