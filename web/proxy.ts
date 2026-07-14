import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

/**
 * Nonce-based CSP per Next.js's documented pattern: the nonce is set on the
 * request headers *before* updateSession runs, so its own
 * `NextResponse.next({ request })` calls carry it through for
 * `next/headers` to read in layout.tsx (and hand to next-themes' inline
 * script). `upgrade-insecure-requests` is skipped outside production
 * because it would force-upgrade the local Supabase connect-src
 * (http://127.0.0.1:54321) to https and break local dev.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isProd = process.env.NODE_ENV === "production";
  const devScriptDirectives = isProd ? "" : " 'unsafe-eval'";
  const devConnectDirectives = isProd
    ? ""
    : " ws://localhost:* http://localhost:*";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devScriptDirectives}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${devConnectDirectives}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isProd ? [`upgrade-insecure-requests`] : []),
  ].join("; ");

  request.headers.set("x-nonce", nonce);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - manifest.webmanifest, icon, apple-icon, manifest-icon-192,
     *   manifest-icon-512 — PWA manifest + icons (see app/manifest.ts,
     *   app/icon.tsx, app/apple-icon.tsx and the two manifest-icon route
     *   handlers). Browsers/OS fetch these unauthenticated to install the
     *   app; gating
     *   them behind login silently breaks "Add to Home Screen" (icons
     *   resolve to the login page's HTML instead of a PNG).
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest$|icon$|apple-icon$|manifest-icon-192$|manifest-icon-512$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
