import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "."),
      "server-only": resolve(import.meta.dirname, "tests/server-only.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
