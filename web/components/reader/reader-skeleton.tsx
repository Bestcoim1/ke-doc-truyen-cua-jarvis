export function ReaderSkeleton() {
  return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden"
      style={{ background: "var(--kd-bg)" }}
      aria-hidden="true"
    >
      <div
        className="flex flex-shrink-0 items-center gap-3 border-b px-3 py-3"
        style={{
          borderColor: "var(--kd-border)",
          background: "var(--kd-surface)",
        }}
      >
        <div
          className="h-8 w-8 animate-pulse rounded-md"
          style={{ background: "var(--kd-border)" }}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div
            className="h-3 w-1/3 animate-pulse rounded"
            style={{ background: "var(--kd-border)" }}
          />
          <div
            className="h-4 w-2/3 animate-pulse rounded"
            style={{ background: "var(--kd-border)" }}
          />
        </div>
        <div
          className="h-8 w-8 animate-pulse rounded-md"
          style={{ background: "var(--kd-border)" }}
        />
        <div
          className="h-8 w-8 animate-pulse rounded-md"
          style={{ background: "var(--kd-border)" }}
        />
      </div>
      <div className="flex-1 space-y-4 px-5 py-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded"
            style={{
              background: "var(--kd-border)",
              width: `${85 - (i % 3) * 15}%`,
            }}
          />
        ))}
      </div>
      <div
        className="flex flex-shrink-0 items-center justify-between border-t px-3 py-3"
        style={{
          borderColor: "var(--kd-border)",
          background: "var(--kd-surface)",
        }}
      >
        <div
          className="h-4 w-20 animate-pulse rounded"
          style={{ background: "var(--kd-border)" }}
        />
        <div
          className="h-4 w-12 animate-pulse rounded"
          style={{ background: "var(--kd-border)" }}
        />
        <div
          className="h-4 w-20 animate-pulse rounded"
          style={{ background: "var(--kd-border)" }}
        />
      </div>
    </div>
  );
}
