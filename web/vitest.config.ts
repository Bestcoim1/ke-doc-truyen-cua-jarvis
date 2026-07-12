import { defineConfig } from "vitest/config";

// Unit tests only: pure functions, no network, no external services. See
// vitest.integration.config.ts for the Supabase-backed RLS/RPC suite.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
  },
});
