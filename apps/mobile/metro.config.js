// Metro config for the pnpm monorepo.
//
// pnpm uses a non-flat node_modules layout (symlinks into a per-package
// `.pnpm` store), so Metro must be told where to find hoisted dependencies
// (e.g. @babel/runtime) and where the workspace packages live. Without this
// the bundler fails to resolve transitive deps like
// `@babel/runtime/helpers/interopRequireDefault`.
//
// We deliberately do NOT watch the whole workspace root: its root
// node_modules is enormous and makes the file crawl (and watchman) hang. We
// watch only the pnpm virtual store and the workspace packages this app
// actually imports, and resolve modules via explicit nodeModulesPaths.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch only what the bundle needs: the pnpm store (resolved dependencies) and
// the workspace packages imported by the app. The app dir itself is always
// watched by default.
config.watchFolders = [
  path.resolve(workspaceRoot, "node_modules/.pnpm"),
  path.resolve(workspaceRoot, "packages/core"),
  path.resolve(workspaceRoot, "packages/config"),
];

// Resolve modules from the app first, then the workspace root, then pnpm's
// hoisted virtual store (where transitive deps such as @babel/runtime live).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules/.pnpm/node_modules"),
];

// Follow pnpm symlinks when resolving.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
