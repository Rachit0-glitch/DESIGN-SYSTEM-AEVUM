import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/blender-real.test.ts"],
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
