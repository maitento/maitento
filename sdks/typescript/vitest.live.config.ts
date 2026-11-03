import { defineConfig } from "vitest/config";

// `npm run test:live`: calls a real Maitento API (MAITENTO_BASE_URL + MAITENTO_API_KEY). Never part of `npm test`.
export default defineConfig({
  test: {
    include: ["test/live/**/*.test.ts"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // Show the run ids, outputs and timings the test logs.
    reporters: ["verbose"],
    silent: false,
  },
});
