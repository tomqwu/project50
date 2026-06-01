import { mergeConfig } from "vitest/config";
import base from "@project50/config/vitest";

export default mergeConfig(base, {
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
    },
  },
});
