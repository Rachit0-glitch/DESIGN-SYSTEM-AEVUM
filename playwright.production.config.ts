import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "studio-production.spec.ts",
  timeout: 60_000,
  retries: 1,
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
