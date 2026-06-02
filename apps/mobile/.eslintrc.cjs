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
};
