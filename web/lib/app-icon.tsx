/**
 * Shared icon artwork for app/icon.tsx, app/apple-icon.tsx, and the
 * manifest icon routes — one design, rendered at whatever size each
 * consumer needs via next/og's ImageResponse. Deliberately simple (solid
 * accent background + a single glyph) since this is placeholder branding
 * pending the real app name (see lib/branding.ts) — swap the glyph/colors
 * here when that's decided, no need to touch the 4 files that import this.
 */
export function AppIconArt({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#a23b2e",
        borderRadius: size * 0.2,
      }}
    >
      <span
        style={{
          fontSize: size * 0.56,
          fontWeight: 700,
          color: "#fdf8ed",
          fontFamily: "serif",
        }}
      >
        Đ
      </span>
    </div>
  );
}
