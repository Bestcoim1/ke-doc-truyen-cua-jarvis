import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export default function Home() {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Supabase chưa được cấu hình — điền{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          và{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          </code>{" "}
          vào <code className="rounded bg-muted px-1 py-0.5">.env.local</code>{" "}
          rồi tải lại.
        </p>
      </main>
    );
  }

  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}

async function HomeRedirect() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return redirect(data?.claims ? "/library" : "/auth/login");
}
