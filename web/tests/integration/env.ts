import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";

// Fails the whole suite (not describe.skip) when unconfigured, on purpose:
// a CI integration job that silently skips is a job that can never fail,
// which is what let migrations regress unnoticed. Run against a local
// instance started from web/supabase/config.toml (`supabase start`) or a
// real project seeded with two test accounts.
const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "KEDOC_TEST_USER_A_EMAIL",
  "KEDOC_TEST_USER_A_PASSWORD",
  "KEDOC_TEST_USER_B_EMAIL",
  "KEDOC_TEST_USER_B_PASSWORD",
] as const;

const missing = REQUIRED_VARS.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(
    `Integration tests require these env vars, missing: ${missing.join(", ")}.\n` +
      "Start a local Supabase instance (`supabase start` in web/, config at " +
      "web/supabase/config.toml), seed two test users, then set the vars before " +
      "running `npm run test:integration`.",
  );
}

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const USER_A_EMAIL = process.env.KEDOC_TEST_USER_A_EMAIL!;
export const USER_A_PASSWORD = process.env.KEDOC_TEST_USER_A_PASSWORD!;
export const USER_B_EMAIL = process.env.KEDOC_TEST_USER_B_EMAIL!;
export const USER_B_PASSWORD = process.env.KEDOC_TEST_USER_B_PASSWORD!;

export function createTestClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
}
