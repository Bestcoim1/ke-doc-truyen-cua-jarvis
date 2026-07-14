import { ImageResponse } from "next/og";

import { AppIconArt } from "@/lib/app-icon";

// A dedicated route (not the app/icon.tsx convention) so manifest.webmanifest
// can reference a stable, predictable URL for this exact size — the 512px
// entry Chrome/Android's installability check looks for.
//
// force-static: this image never varies per-request — without it Next.js
// treats a plain route handler as dynamic and re-runs ImageResponse (real
// CPU work) on every single load instead of serving a cached response.
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(<AppIconArt size={512} />, {
    width: 512,
    height: 512,
  });
}
