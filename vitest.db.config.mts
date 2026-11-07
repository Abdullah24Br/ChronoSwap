import "dotenv/config";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/db/test-database.mts";

// Integration tests against a real PostgreSQL. `npm run test:db`
// Uses a separate "<db>_test" database that is dropped and re-migrated on every run.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/db/global-setup.ts"],
    setupFiles: ["tests/db/setup-warnings.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Tests never call the real Gemini (FR-4.3 / FR-8.1): tests that need AI mock callGemini.
    env: { DATABASE_URL: testDatabaseUrl(), GEMINI_API_KEY: "" },
  },
});
