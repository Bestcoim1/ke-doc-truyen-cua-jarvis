import { BookOpen, Home, Library, PenTool, Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { isSupabaseConfigured } from "@/lib/utils";

const STUDIO_NAV = [
  { href: "/studio", label: "Tác phẩm", icon: Home },
  { href: "/library", label: "Kệ đọc", icon: Library },
  { href: "/settings", label: "Cài đặt", icon: Settings },
] as const;

export function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="studio-shell min-h-[100dvh] bg-[var(--studio-bg)] text-[var(--studio-text)]">
      <header className="sticky top-0 z-40 border-b border-[var(--studio-border)] bg-[color:var(--studio-header)] backdrop-blur-xl lg:hidden">
        <div className="flex min-h-16 items-center gap-3 px-4">
          <Link href="/studio" className="flex min-w-0 items-center gap-2 font-extrabold">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--studio-accent)] text-white">
              <PenTool size={18} />
            </span>
            <span className="truncate">Phòng Sáng Tác</span>
          </Link>
          <div className="ml-auto">
            {isSupabaseConfigured ? (
              <Suspense fallback={null}>
                <AuthButton />
              </Suspense>
            ) : (
              <EnvVarWarning />
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3" aria-label="Điều hướng Phòng Sáng Tác">
          {STUDIO_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-bold text-[var(--studio-muted)] hover:bg-[var(--studio-surface)] hover:text-[var(--studio-text)]"
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-[var(--studio-border)] bg-[color:var(--studio-sidebar)] px-5 py-6 lg:flex">
        <Link href="/studio" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--studio-accent)] text-white shadow-lg shadow-black/10">
            <PenTool size={20} />
          </span>
          <span>
            <span className="block text-lg font-extrabold">Phòng Sáng Tác</span>
            <span className="block text-xs font-semibold text-[var(--studio-muted)]">
              Bộ nhớ cho từng tác phẩm
            </span>
          </span>
        </Link>

        <nav className="mt-9 space-y-2" aria-label="Điều hướng Phòng Sáng Tác">
          {STUDIO_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-[var(--studio-muted)] transition-colors hover:bg-[var(--studio-surface)] hover:text-[var(--studio-text)]"
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-3xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-4">
          <BookOpen size={19} className="text-[var(--studio-accent)]" />
          <p className="mt-3 text-sm font-extrabold">Canon thuộc về tác giả</p>
          <p className="mt-1 text-xs leading-5 text-[var(--studio-muted)]">
            Studio chỉ ghi nhớ và dẫn nguồn. Không tự sửa truyện, không tự xác nhận canon.
          </p>
        </div>
        <div className="mt-4">
          {isSupabaseConfigured ? (
            <Suspense fallback={null}>
              <AuthButton />
            </Suspense>
          ) : (
            <EnvVarWarning />
          )}
        </div>
      </aside>

      <main className="lg:pl-72">{children}</main>
    </div>
  );
}
