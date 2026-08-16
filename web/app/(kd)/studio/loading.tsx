export default function StudioLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse p-7" aria-busy="true">
      <div className="h-12 w-2/3 rounded-2xl bg-[var(--studio-surface)]" />
      <div className="mt-8 h-96 rounded-[2rem] bg-[var(--studio-surface)]" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-[2rem] bg-[var(--studio-surface)]" />
        <div className="h-72 rounded-[2rem] bg-[var(--studio-surface)]" />
      </div>
    </div>
  );
}

