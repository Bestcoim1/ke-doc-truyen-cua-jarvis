import { Be_Vietnam_Pro, Noto_Serif } from "next/font/google";
import { OfflineSyncManager } from "@/components/offline-sync-manager";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-kd-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const notoSerif = Noto_Serif({
  variable: "--font-kd-serif",
  weight: ["400", "600"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

/**
 * Shell only: fonts + kd theme scope. The app header lives in the Library
 * layout, NOT here — the Reader must own the full viewport (FR-08:
 * "Reader dùng toàn viewport trên mobile"). With a header above it, the
 * Reader's h-[100dvh] overflowed the page by the header's height, pushing
 * the prev/next footer below the fold and creating a nested-scroll trap.
 */
export default async function KdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userId: string | null = null;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    userId = (data?.claims?.sub as string | undefined) ?? null;
  }

  return (
    <div
      className={`kd-shell ${beVietnamPro.variable} ${notoSerif.variable}`}
      style={{ fontFamily: "var(--font-kd-sans)" }}
    >
      <OfflineSyncManager userId={userId} />
      {children}
    </div>
  );
}
