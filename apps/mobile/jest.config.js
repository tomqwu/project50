/** @type {import('jest').Config} */
const config = {
  preset: "jest-expo",
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  coverageThreshold: {
    // 99% gate on each source dir we control.
    // Native-glue exclusions are documented in COVERAGE.md.
    "src/components/**": {
      lines: 99,
      branches: 99,
      functions: 99,
      statements: 99,
    },
    "src/lib/**": {
      lines: 99,
      branches: 99,
      functions: 99,
      statements: 99,
    },
    "src/viewmodels/**": {
      lines: 99,
      branches: 99,
      functions: 99,
      statements: 99,
    },
    "src/screens/**": {
      lines: 99,
      branches: 99,
      functions: 99,
      statements: 99,
    },
  },
  // jest-expo transformIgnorePatterns: transform RN/Expo modules that ship as Flow/ESM.
  //
  // In a pnpm monorepo the virtual store path looks like:
  //   .../node_modules/.pnpm/@react-native+js-polyfills@X.Y/node_modules/@react-native/...
  // The FIRST `node_modules/` segment leads to `.pnpm`, which must be excluded from the
  // "do not transform" rule so the regex engine continues to the real package.
  //
  // Pattern: do NOT transform anything in node_modules UNLESS it's one of the listed packages.
  // Also exclude `.pnpm` from the stop condition so the second node_modules/ inside .pnpm is checked.
  // Per jest-expo docs: https://docs.expo.dev/develop/unit-testing/#configuration
  transformIgnorePatterns: [
    "/node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};

module.exports = config;
