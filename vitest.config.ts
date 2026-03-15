import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@arxiv-feed/core": path.resolve(__dirname, "packages/core/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**", "packages/functions/src/**"],
      exclude: ["**/node_modules/**", "**/tests/**"],
    },
  },
});
