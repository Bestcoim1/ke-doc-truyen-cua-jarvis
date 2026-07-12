import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { headers } from "next/headers";
import { Suspense } from "react";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Kệ Đọc",
  description: "Bản đọc riêng tư cho bản thảo của tác giả và dịch giả.",
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
