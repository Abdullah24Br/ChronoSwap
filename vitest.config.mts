import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests: pure logic, no database. `npm test`
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
