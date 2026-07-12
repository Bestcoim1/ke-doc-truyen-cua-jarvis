export function LibrarySkeleton() {
  return (
    <div className="p-6" aria-hidden="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-8 w-40 animate-pulse rounded" style={{ background: "var(--kd-border)" }} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="h-9 w-36 animate-pulse rounded-lg" style={{ background: "var(--kd-border)" }} />
          <div className="h-9 w-36 animate-pulse rounded-lg" style={{ background: "var(--kd-border)" }} />
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="rounded-xl p-4"
            style={{ background: "var(--kd-surface)", border: "1px solid var(--kd-border)" }}
          >
            <div className="h-4 w-2/3 animate-pulse rounded" style={{ background: "var(--kd-border)" }} />
            <div className="mt-2 h-3 w-1/4 animate-pulse rounded" style={{ background: "var(--kd-border)" }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
