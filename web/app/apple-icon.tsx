import { ImageResponse } from "next/og";

import { AppIconArt } from "@/lib/app-icon";

// 180x180 is Apple's documented recommended touch-icon size — this is what
// actually shows up when a user does Safari > Share > "Add to Home Screen"
// on the iPhone this app targets (app/icon.tsx's 512px favicon is not what
// iOS uses for that).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={180} />, size);
}
