import Link from "next/link";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";

import { AppBottomNav, AppTopNav } from "@/components/app-navigation";
import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { APP_BRANDING } from "@/lib/branding";
import { isSupabaseConfigured } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--kd-bg) 86%, transparent)",
          borderColor: "var(--kd-border)",
        }}
      >
        <div
          className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6"
          style={{
            paddingTop: "max(0rem, env(safe-area-inset-top))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          <Link href="/library" className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--kd-binding)", color: "var(--kd-accent-foreground)" }}
            >
              <BookOpen size={18} />
            </span>
            <span className="truncate text-base font-extrabold tracking-tight">{APP_BRANDING.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <AppTopNav />
            {isSupabaseConfigured ? (
              <Suspense fallback={null}>
                <AuthButton />
              </Suspense>
            ) : (
              <EnvVarWarning />
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <AppBottomNav />
    </div>
  );
}
