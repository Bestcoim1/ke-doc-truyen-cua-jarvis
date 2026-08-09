export const DEFAULT_PAGE_SIZE = 1000;

export type PageResult<T, E> = {
  data: T[] | null;
  error: E | null;
};

/**
 * Collect a complete PostgREST result without relying on the project's
 * server-side max_rows setting. Callers must apply a deterministic order
 * before range() so page boundaries cannot shuffle between requests.
 */
export async function fetchAllPages<T, E>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T, E>>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<PageResult<T, E>> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new RangeError("pageSize must be a positive safe integer");
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };

    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

export function chunkValues<T>(values: readonly T[], chunkSize = 200): T[][] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive safe integer");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function fetchAllValueChunks<T, V, E>(
  values: readonly V[],
  fetchPage: (
    chunk: readonly V[],
    from: number,
    to: number,
  ) => PromiseLike<PageResult<T, E>>,
  chunkSize = 200,
): Promise<PageResult<T, E>> {
  const rows: T[] = [];
  for (const chunk of chunkValues(values, chunkSize)) {
    const result = await fetchAllPages((from, to) => fetchPage(chunk, from, to));
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}
