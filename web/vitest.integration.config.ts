import { defineConfig } from "vitest/config";

// RLS/RPC suite against a real Supabase instance (local via `supabase start`,
// config at supabase/config.toml, or a real project). Fails — does not skip
// — when the required env vars are unset; see tests/integration/env.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
  },
});
