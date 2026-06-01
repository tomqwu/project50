import { defineConfig, mergeConfig } from "vitest/config";
import base from "@project50/config/vitest";
import { fileURLToPath } from "node:url";

export default mergeConfig(
  base,
  defineConfig({
    esbuild: {
      jsx: "automatic",
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL(".", import.meta.url)),
      },
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
