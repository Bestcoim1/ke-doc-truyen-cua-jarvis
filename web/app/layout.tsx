import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { headers } from "next/headers";
import { Suspense } from "react";
import "./globals.css";
import { APP_BRANDING } from "@/lib/branding";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: APP_BRANDING.defaultPageTitle,
  description: APP_BRANDING.description,
  // iOS Safari needs these beyond the manifest.ts convention (which handles
  // <link rel="manifest">, app/icon.tsx and app/apple-icon.tsx automatically)
  // to launch standalone (no browser chrome) from "Add to Home Screen"
  // instead of opening as a bookmark.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_BRANDING.shortName,
  },
};

// viewportFit "cover" is what makes env(safe-area-inset-*) resolve to real
// values on notched devices — the reader's fixed header/footer already read
// those insets (components/reader/reader-view.tsx), but without this they
// stay 0 and the chrome tucks under the notch / home indicator. width +
// initialScale keep Next's mobile defaults; maximum-scale is deliberately
// left unset so pinch-zoom to 200% still works (AC-A11Y-01).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

// headers() is per-request data — under cacheComponents it must sit behind
// a Suspense boundary so routes can still prerender a static shell instead
// of failing the build. Reading it here (instead of splitting into its own
// component) means the whole tree is the dynamic hole, which is fine since
// every route in this app is already per-user/dynamic anyway.
async function NonceThemeProvider({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <Suspense fallback={null}>
          <NonceThemeProvider>{children}</NonceThemeProvider>
        </Suspense>
      </body>
    </html>
  );
}
