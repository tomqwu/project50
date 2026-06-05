import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Monorepo root (two levels up from apps/web). Used as the standalone output
// file tracing root so the trace reaches sibling workspace packages
// (@project50/core, @project50/db, @project50/ui, @project50/recap) and the
// hoisted pnpm store — required for the Docker standalone runner (see Dockerfile).
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Resolve release metadata for the in-app ReleaseBadge (see lib/build-info.ts).
 *
 * Precedence: explicit NEXT_PUBLIC_RELEASE_* env (set by the deploy pipeline
 * from the GitHub release — see .github/workflows/release.yml) wins; otherwise
 * we derive the commit SHA and a build timestamp from git so a plain
 * `next build` still embeds honest values. Tag/title default to "dev" locally.
 *
 * @returns {Record<string, string>}
 */
function resolveReleaseEnv() {
  /** Best-effort git read; returns "" on any failure (shallow checkout, no git). */
  const git = (cmd) => {
    try {
      return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };

  const sha = process.env.NEXT_PUBLIC_RELEASE_SHA || git("git rev-parse --short=7 HEAD") || "local";
  // Only adopt a git tag when HEAD is *exactly* that tag, so untagged commits
  // honestly read "dev" rather than the nearest older release.
  const tag = process.env.NEXT_PUBLIC_RELEASE_TAG || git("git describe --tags --exact-match") || "dev";
  return {
    NEXT_PUBLIC_RELEASE_TAG: tag,
    NEXT_PUBLIC_RELEASE_SHA: sha,
    NEXT_PUBLIC_RELEASE_TIME: process.env.NEXT_PUBLIC_RELEASE_TIME || new Date().toISOString(),
    // The deploy pipeline passes the title base64-encoded (NEXT_PUBLIC_RELEASE_TITLE_B64)
    // so its spaces/parens survive `az acr build`'s unquoted remote docker build;
    // decode it here. Falls back to the legacy raw NEXT_PUBLIC_RELEASE_TITLE, then
    // the "dev" default. Mirrors lib/release-title.ts (resolveReleaseTitle), which
    // next.config.mjs cannot import directly (it can't load TypeScript).
    NEXT_PUBLIC_RELEASE_TITLE: resolveReleaseTitle(),
    NEXT_PUBLIC_RELEASE_URL: process.env.NEXT_PUBLIC_RELEASE_URL || "",
  };
}

/**
 * Resolve the ReleaseBadge title, preferring a decoded NEXT_PUBLIC_RELEASE_TITLE_B64.
 * Kept in sync with lib/release-title.ts (the unit-tested implementation); see
 * that file for why the title is base64-encoded across the build boundary AND why
 * the decode is validated (Buffer.from is lenient, so a malformed/raw value would
 * otherwise inline garbage instead of falling back).
 *
 * @returns {string}
 */
function resolveReleaseTitle() {
  const decoded = decodeReleaseTitleB64(process.env.NEXT_PUBLIC_RELEASE_TITLE_B64);
  if (decoded) return decoded;
  return process.env.NEXT_PUBLIC_RELEASE_TITLE || "Local development build";
}

/**
 * Mirror of lib/release-title.ts:decodeReleaseTitleB64 (which can't be imported —
 * next.config.mjs loads as plain JS, not TypeScript). Validates the input is a
 * genuine, pipeline-produced value before trusting the lenient
 * `Buffer.from(x,"base64")` decode: standard base64 (charset + length%4 + exact
 * round-trip), then a SENTINEL prefix that distinguishes our encoding from an
 * arbitrary base64-looking string (e.g. "TWFu"->"Man"), then a printable-UTF-8
 * title. Returns "" for anything malformed/un-sentineled so the caller falls back.
 * The sentinel ("p50" + U+001F) is kept byte-for-byte in sync with
 * lib/release-title.ts and scripts/release-build-args.sh.
 *
 * @param {string | undefined} b64
 * @returns {string}
 */
function decodeReleaseTitleB64(b64) {
  if (!b64) return "";
  const input = b64.trim();
  if (!input || input.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) return "";
  const sentinel = `p50${String.fromCharCode(0x1f)}`;
  try {
    const decoded = Buffer.from(input, "base64").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64") !== input) return "";
    if (!decoded.startsWith(sentinel)) return "";
    const title = decoded.slice(sentinel.length);
    if (!title || title.includes("�")) return "";
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(title)) return "";
    return title;
  } catch {
    return "";
  }
}

/**
 * Build the allow-list of remote image hosts for next/image optimization.
 *
 * Media in Project 50 lives in object storage (MinIO in dev/staging, S3 +
 * CDN in prod). The public base URL is configured via S3_PUBLIC_URL (falling
 * back to S3_ENDPOINT — see lib/storage.ts and .env.example). We derive the
 * remotePattern from whichever is set so next/image can be pointed at the CDN
 * host without code changes: just set S3_PUBLIC_URL to the CDN origin.
 *
 * NOTE: today's rendered media uses short-lived *presigned* GET URLs (5 min,
 * query-signed — see lib/api/media.ts / lib/api/recap.ts), which are NOT good
 * candidates for next/image (the signature query string makes the optimizer
 * cache key churn on every request, and the URLs expire). Those remain raw
 * <img>; see docs/CDN.md. This allow-list is here so that (a) any non-signed,
 * CDN-served public media and (b) a future migration to public CDN URLs can
 * use next/image without further config.
 *
 * @returns {NonNullable<import('next').NextConfig['images']>['remotePatterns']}
 */
function buildRemotePatterns() {
  const origins = [
    process.env.S3_PUBLIC_URL,
    process.env.S3_ENDPOINT,
    // Local MinIO default (matches lib/storage.ts fallback) so dev works
    // out of the box with no env configured.
    "http://localhost:9000",
  ].filter(Boolean);

  /** @type {NonNullable<NonNullable<import('next').NextConfig['images']>['remotePatterns']>} */
  const patterns = [];
  const seen = new Set();
  for (const origin of origins) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      // Skip malformed origins rather than failing the build.
      continue;
    }
    const protocol = url.protocol.replace(":", "");
    if (protocol !== "http" && protocol !== "https") continue;
    const key = `${protocol}//${url.hostname}:${url.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push({
      protocol,
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: "/**",
    });
  }
  return patterns;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Strip the `x-powered-by: Next.js` response header. It leaks the framework
  // (fingerprinting) and adds nothing for clients — flagged by the live audit
  // (#274, fixes #292).
  poweredByHeader: false,
  // Emit a self-contained server bundle (.next/standalone) for the Docker image
  // so the runner stage needs only Node + the traced files, not the full
  // node_modules / pnpm store. See apps/web/Dockerfile.
  output: "standalone",
  // In a pnpm monorepo the trace must be rooted at the repo root so it follows
  // workspace dependencies and the hoisted .pnpm store; otherwise the standalone
  // output is missing the @project50/* packages and their transitive deps.
  experimental: {
    outputFileTracingRoot: monorepoRoot,
  },
  // Inline release metadata (CalVer tag, commit SHA, build time, feature intro)
  // for the in-app ReleaseBadge. Derived from git locally; overridden by the
  // deploy pipeline from the GitHub release.
  env: resolveReleaseEnv(),
  transpilePackages: ["@project50/core", "@project50/db", "@project50/recap", "@project50/ui"],
  images: {
    // Prefer modern formats; Next negotiates per Accept header and falls back.
    formats: ["image/avif", "image/webp"],
    // Allow next/image to optimize media served from the object-store/CDN
    // origin(s). Env-driven (S3_PUBLIC_URL / S3_ENDPOINT) with a localhost
    // MinIO default for dev.
    remotePatterns: buildRemotePatterns(),
    // Sensible responsive breakpoints. deviceSizes drives `sizes`-based
    // srcset for full-width images; imageSizes covers fixed-size thumbnails.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache optimized images at the Next layer for 24h; the CDN in front of
    // the app provides the durable edge cache — see docs/CDN.md.
    minimumCacheTTL: 60 * 60 * 24,
  },
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
