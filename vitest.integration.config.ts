import { defineConfig } from "vitest/config";

/** Integration tests: real Postgres (PGlite locally, a service container in CI). */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": new URL("./tests/integration/server-only-stub.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: { TZ: "UTC" },
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
