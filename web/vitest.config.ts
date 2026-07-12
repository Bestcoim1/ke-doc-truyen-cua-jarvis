import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Unit tests only: pure functions, no network, no external services. See
// vitest.integration.config.ts for the Supabase-backed RLS/RPC suite.
export default defineConfig({
  resolve: {
    alias: { "@": dirname },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
  },
});
