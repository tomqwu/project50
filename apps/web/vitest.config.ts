import { defineConfig, mergeConfig } from "vitest/config";
import base from "@project50/config/vitest";

export default mergeConfig(
  base,
  defineConfig({
    esbuild: {
      jsx: "automatic",
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      exclude: ["e2e/**", "node_modules/**"],
      coverage: {
        include: ["app/**/*.{ts,tsx}"],
        exclude: ["e2e/**"],
      },
    },
  }),
);
