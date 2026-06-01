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
      setupFiles: ["./vitest.setup.ts", "./test/load-env.ts"],
      exclude: ["e2e/**", "node_modules/**"],
      // Run test files sequentially so integration tests don't race on the DB.
      fileParallelism: false,
      coverage: {
        include: ["app/**/*.{ts,tsx}", "lib/**/*.ts", "auth.ts"],
        exclude: ["e2e/**"],
      },
    },
  }),
);
