import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deliberately NOT enabled: cacheComponents lets Next statically prerender
  // a page's shell and serve it from Vercel's edge cache (confirmed in
  // production via X-Vercel-Cache: HIT). The CSP nonce middleware.ts embeds
  // in <script nonce="..."> tags is baked into that cached HTML at
  // prerender time, while the Content-Security-Policy RESPONSE HEADER is
  // regenerated fresh on every request — so a cached page's script nonce
  // can never match its own response header's nonce. The browser then
  // blocks every script from executing: no hydration, no click handlers,
  // no error/success feedback — a page that looks fine but is completely
  // inert. Every route here is per-user/dynamic anyway (per proxy.ts's own
  // comment), so there's no real caching upside being given up.
  poweredByHeader: false,
  experimental: {
    // Paste imports can exceed Next's 1 MB Server Action default; input is
    // still bounded to 5 million characters in the action itself.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // CSP is per-request (needs a fresh nonce) so it's set in
          // middleware.ts instead of here. HSTS is unconditional here since
          // browsers ignore it on plain-http responses (local dev is fine).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
