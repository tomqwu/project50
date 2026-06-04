const base = require("@project50/config/eslint");

module.exports = {
  ...base,
  root: true,
  globals: {
    ...(base.globals || {}),
    __DEV__: "readonly",
  },
  ignorePatterns: [
    ...(base.ignorePatterns || []),
    ".expo",
    "android",
    "ios",
    "coverage",
  ],
  overrides: [
    ...(base.overrides || []),
    {
      // Tests use jest.isolateModules + require() to load fresh copies of a module
      // under test (resetting module-level state between cases). That requires the
      // CommonJS require() form, which jest.isolateModules expects.
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "@typescript-eslint/no-require-imports": "off",
      },
    },
  ],
};
