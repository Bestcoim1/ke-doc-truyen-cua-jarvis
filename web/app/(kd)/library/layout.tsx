import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
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
        <span className="shrink-0 whitespace-nowrap text-lg font-bold">Kệ Đọc</span>
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
