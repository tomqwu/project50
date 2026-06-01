import { defineConfig } from "vitest/config";

// The hard coverage gate. Exclusions are listed (and justified in
// docs/coverage-exclusions.md) — never widened silently to pass.
export const coverageThresholds = {
  lines: 99,
  branches: 99,
  functions: 99,
  statements: 99,
};

export const sharedCoverageExclude = [
  "**/*.config.*",
  "**/*.generated.*",
  "**/dist/**",
  "**/.next/**",
  "**/node_modules/**",
  "**/*.d.ts",
];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: coverageThresholds,
      exclude: sharedCoverageExclude,
    },
  },
});
