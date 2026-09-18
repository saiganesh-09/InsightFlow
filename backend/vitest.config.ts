import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration tests hit the real DB — run serially to avoid cross-talk
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
