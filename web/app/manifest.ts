import type { MetadataRoute } from "next";

// Next.js's manifest.ts convention: auto-served at /manifest.webmanifest
// and auto-linked in <head> — no manual <link rel="manifest"> needed.
// This is what makes Safari's "Add to Home Screen" (and Chrome/Android's
// install prompt) launch the app standalone with its own icon instead of
// as a bookmark inside browser chrome.
//
// name/short_name/description are plain strings here (not lib/branding.ts's
// APP_BRANDING) because that file lives on a separate, not-yet-merged
// branch — wire this up to APP_BRANDING once both land, so there's one
// source of truth instead of two places to edit on a rename.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kệ Đọc",
    short_name: "Kệ Đọc",
    description: "Bản đọc riêng tư cho bản thảo của tác giả và dịch giả.",
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
