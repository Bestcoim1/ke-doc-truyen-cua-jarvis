import type { MetadataRoute } from "next";

import { APP_BRANDING } from "@/lib/branding";

// Next.js's manifest.ts convention: auto-served at /manifest.webmanifest
// and auto-linked in <head> — no manual <link rel="manifest"> needed.
// This is what makes Safari's "Add to Home Screen" (and Chrome/Android's
// install prompt) launch the app standalone with its own icon instead of
// as a bookmark inside browser chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_BRANDING.name,
    short_name: APP_BRANDING.shortName,
    description: APP_BRANDING.description,
    start_url: "/",
    display: "standalone",
    background_color: "#eee6d3",
    theme_color: "#a23b2e",
    icons: [
      { src: "/manifest-icon-192", sizes: "192x192", type: "image/png" },
      { src: "/manifest-icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
