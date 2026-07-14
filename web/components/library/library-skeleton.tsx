export function LibrarySkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8" aria-hidden="true">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="h-4 w-48 animate-pulse rounded-full" style={{ background: "var(--kd-border)" }} />
          <div className="mt-3 h-11 w-64 animate-pulse rounded-2xl" style={{ background: "var(--kd-border)" }} />
          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded-full" style={{ background: "var(--kd-border)" }} />
        </div>
        <div className="grid gap-2 sm:flex">
          <div className="h-10 w-full animate-pulse rounded-full sm:w-36" style={{ background: "var(--kd-border)" }} />
          <div className="h-10 w-full animate-pulse rounded-full sm:w-36" style={{ background: "var(--kd-border)" }} />
        </div>
      </div>
      <div className="mt-6 h-11 w-full max-w-xs animate-pulse rounded-full" style={{ background: "var(--kd-border)" }} />
      <ul className="mt-6 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <li
            key={index}
            className="rounded-3xl border p-5"
            style={{ background: "var(--kd-surface)", borderColor: "var(--kd-border)" }}
          >
            <div className="flex gap-4">
              <div className="h-14 w-12 animate-pulse rounded-xl" style={{ background: "var(--kd-border)" }} />
              <div className="flex-1">
                <div className="h-5 w-4/5 animate-pulse rounded-full" style={{ background: "var(--kd-border)" }} />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full" style={{ background: "var(--kd-border)" }} />
              </div>
            </div>
            <div className="mt-6 h-3 animate-pulse rounded-full" style={{ background: "var(--kd-border)" }} />
            <div className="mt-5 h-3 animate-pulse rounded-full" style={{ background: "var(--kd-border)" }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
