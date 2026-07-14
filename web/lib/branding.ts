/**
 * Single source of truth for user-facing app name/copy. Renaming the
 * product means editing this file only — no other file should hardcode
 * "Kệ Đọc" (or its future replacement) as literal text.
 *
 * Values below are still the original "Kệ Đọc" branding, carried over
 * verbatim from app/layout.tsx's metadata and the (kd) route group's
 * header — this file is a placeholder-for-the-real-rename refactor, not a
 * rename itself.
 */
export const APP_BRANDING = {
  /** Full product name — header logo, library/import layout brand link. */
  name: "Kệ Đọc",
  /** Short form for tight spaces (mobile nav, PWA icon label). Same as `name` today. */
  shortName: "Kệ Đọc",
  /** One-line pitch. Not shown anywhere yet — reserved for a future marketing/landing surface. */
  tagline: "Đọc bản thảo cá nhân, luôn giữ đúng vị trí đang đọc",
  /** <meta name="description"> and any longer-form "what is this" copy. */
  description: "Bản đọc riêng tư cho bản thảo của tác giả và dịch giả.",
  /** Base <title> for app/layout.tsx's root metadata. */
  defaultPageTitle: "Kệ Đọc",
} as const;
