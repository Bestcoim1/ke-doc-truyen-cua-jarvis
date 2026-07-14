import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { APP_BRANDING } from "@/lib/branding";
import { isSupabaseConfigured } from "@/lib/utils";

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--kd-border)" }}
      >
        <span className="text-lg font-bold">{APP_BRANDING.name}</span>
        {isSupabaseConfigured ? (
          <Suspense>
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
