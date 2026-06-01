/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  transpilePackages: ["@project50/core", "@project50/db", "@project50/recap", "@project50/ui"],
  webpack(config, { isServer }) {
    // ESM-first packages (like @project50/recap) use .js extensions in source imports.
    // Tell webpack to also look for .tsx/.ts when resolving .js for transpiled packages.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".tsx", ".ts", ".js"],
    };

    // @remotion/bundler and @remotion/renderer use esbuild + native modules
    // that cannot be bundled by webpack. Mark them as externals so they are
    // required at runtime (Node.js server) rather than bundled.
    if (isServer) {
      const existing = config.externals ?? [];
      const asArray = Array.isArray(existing) ? existing : [existing];
      config.externals = [
        ...asArray,
        "@remotion/bundler",
        "@remotion/renderer",
        "remotion",
      ];
    }

    return config;
  },
};
