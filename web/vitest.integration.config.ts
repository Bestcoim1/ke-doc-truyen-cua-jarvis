import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// RLS/RPC suite against a real Supabase instance (local via `supabase start`,
// config at supabase/config.toml, or a real project). Fails — does not skip
// — when the required env vars are unset; see tests/integration/env.ts.
export default defineConfig({
  resolve: {
    alias: { "@": dirname },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
  },
});
