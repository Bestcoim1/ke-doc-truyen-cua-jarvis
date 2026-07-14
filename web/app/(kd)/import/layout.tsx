import Link from "next/link";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { APP_BRANDING } from "@/lib/branding";
import { isSupabaseConfigured } from "@/lib/utils";

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header
        className="flex items-center justify-between px-4 py-4 sm:px-6"
        style={{ borderBottom: "1px solid var(--kd-border)" }}
      >
        <Link href="/library" className="shrink-0 whitespace-nowrap text-lg font-bold">
          {APP_BRANDING.name}
        </Link>
        {isSupabaseConfigured ? (
          <Suspense fallback={null}>
            <AuthButton />
          </Suspense>
        ) : (
          <EnvVarWarning />
        )}
      </header>
      <main>{children}</main>
    </>
  );
}
