import { mergeConfig } from "vitest/config";
import base, { sharedCoverageExclude } from "@project50/config/vitest";

export default mergeConfig(base, {
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        ...sharedCoverageExclude,
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
      ],
    },
  },
});
