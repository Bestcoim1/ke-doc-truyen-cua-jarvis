import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright drives the real Next.js app (SSR shell, middleware, routing) —
 * the layer vitest can't reach. Two tiers, split by what they need:
 *
 * - e2e/*.smoke.spec.ts  — unauthenticated journeys only (login renders,
 *   protected routes redirect). No database writes, no seeded user, so they
 *   run anywhere the app boots, including against the real Supabase project
 *   in .env.local. This is the CI smoke net.
 * - e2e/*.journey.spec.ts — authenticated happy paths (import → read →
 *   resume). These need a seeded user + a resettable Supabase instance and
 *   self-skip (test.skip) unless KEDOC_E2E_AUTH is set, so a run without
 *   that infrastructure stays green on the smoke tier instead of failing
 *   for the wrong reason. CI wires them to the `supabase start` job.
 *
 * baseURL comes from PLAYWRIGHT_BASE_URL when set (CI points it at the
 * already-running `next start`), otherwise Playwright starts `next dev` here.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    // A cold `next dev` compiles each route on first hit; give navigations
    // room so the first test of a run isn't flaky on compile latency.
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/auth/login",
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
