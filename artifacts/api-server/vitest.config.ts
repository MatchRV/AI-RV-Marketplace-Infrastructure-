import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // Several suites load the full inventory snapshot on first use; on
    // slower disks that alone exceeds the 5s default per-test cap.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
