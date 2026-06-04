/** @type {import('next').NextConfig} */
const nextConfig = {
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

// Sentry is OPT-IN: only wrap the config (which enables source-map upload and the
// Sentry webpack plugin) when a DSN is present. With no DSN — the default in dev,
// CI, and e2e — the config is returned untouched and the build behaves exactly as
// before. See instrumentation.ts / instrumentation-client.ts for the runtime init.
const sentryEnabled = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

let exported = nextConfig;

if (sentryEnabled) {
  const { withSentryConfig } = await import("@sentry/nextjs");
  exported = withSentryConfig(exported, {
    // Suppress build-time logs unless explicitly debugging.
    silent: true,
    // Org/project + auth token are read from SENTRY_ORG / SENTRY_PROJECT /
    // SENTRY_AUTH_TOKEN env vars (set only in environments that upload source maps).
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Only upload source maps when an auth token is available; otherwise skip
    // upload so a DSN-only setup (e.g. runtime error capture) still builds.
    sourcemaps: {
      disable: !process.env.SENTRY_AUTH_TOKEN,
    },
    // Route browser Sentry requests through a Next rewrite to bypass ad-blockers.
    tunnelRoute: "/monitoring",
    // Tree-shake Sentry logger/debug statements from the client bundle.
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  });
}

// Bundle analysis is OPT-IN: only wrap with @next/bundle-analyzer when
// ANALYZE=true. Run `ANALYZE=true pnpm --filter @project50/web build` to emit
// the interactive treemap reports (client.html / nodejs.html / edge.html under
// apps/web/.next/analyze/). Normal builds and CI leave ANALYZE unset, so the
// analyzer is a no-op and the build output is unchanged. The analyzer is applied
// as the OUTERMOST wrapper so it observes the final (optionally Sentry-wrapped)
// config and never interferes with the DSN-gated Sentry plugin above.
if (process.env.ANALYZE === "true") {
  const { default: withBundleAnalyzer } = await import("@next/bundle-analyzer");
  exported = withBundleAnalyzer({ enabled: true })(exported);
}

export default exported;
