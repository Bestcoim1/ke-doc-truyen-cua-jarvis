"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Search, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/library", label: "Thư viện", icon: BookOpen },
  { href: "/search", label: "Tìm kiếm", icon: Search },
  { href: "/settings", label: "Cài đặt", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppTopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 sm:flex" aria-label="Điều hướng chính">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors",
              active ? "text-[var(--kd-accent)]" : "text-[var(--kd-text-muted)] hover:text-[var(--kd-text)]",
            )}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:hidden"
      style={{
        background: "color-mix(in srgb, var(--kd-surface) 88%, transparent)",
        borderColor: "var(--kd-border)",
      }}
      aria-label="Điều hướng chính"
    >
      <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-colors",
                active
                  ? "bg-[var(--kd-bg)] text-[var(--kd-accent)]"
                  : "text-[var(--kd-text-muted)] hover:text-[var(--kd-text)]",
              )}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
