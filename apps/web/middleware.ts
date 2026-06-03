import { NextResponse } from "next/server";

/**
 * Security headers (M0 #31).
 *
 * Sets a Content-Security-Policy plus the standard hardening headers on every
 * app/API response.
 *
 * `script-src` and `style-src` allow `'unsafe-inline'`. This is a deliberate,
 * pragmatic choice for this Next.js App Router app:
 *   - styles are React inline `style={{…}}` attributes throughout, which CSP
 *     cannot nonce;
 *   - a nonce-based `script-src` would block the framework's inline bootstrap on
 *     statically-rendered routes (e.g. /signin, public /c/[shareId]), whose
 *     script tags are baked at build time without a per-request nonce — making a
 *     strict script CSP infeasible without forcing every route to dynamic
 *     rendering (and losing those routes' static/cacheable delivery).
 * Everything else is locked down: `object-src 'none'`, `base-uri 'self'`,
 * `frame-ancestors 'none'`, scoped `connect/img/media` sources, etc. A future
 * hardening step could move to nonce-based scripts if all routes go dynamic.
 *
 * Media (images/video) is served from, and uploaded directly to, the object
 * store, so its origin (derived from S3_ENDPOINT) is allowed in img/media/connect.
 * `upgrade-insecure-requests` is omitted so http object stores (the local/CI
 * MinIO on :9000) keep working; HSTS handles transport security in prod.
 */

// OAuth providers we redirect to during sign-in — allowed as form-action targets
// for robustness (some flows submit a form whose redirect Chromium checks here).
const OAUTH_FORM_ACTIONS = ["https://accounts.google.com", "https://www.facebook.com"];

function storageOrigin(): string {
  const endpoint = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT;
  if (!endpoint) return "";
  try {
    return new URL(endpoint).origin;
  } catch {
    return "";
  }
}

export function middleware(): NextResponse {
  const s3 = storageOrigin();
  const withS3 = (...sources: string[]) => [...sources, s3].filter(Boolean).join(" ");

  // `next dev` (Fast Refresh / HMR) evaluates code via eval() and opens a
  // websocket back to the dev server — both are blocked by the production CSP.
  // Relax ONLY in development so `pnpm dev` works; production stays strict
  // (no 'unsafe-eval', no ws:). Gated on NODE_ENV, which is "production" for the
  // built app (`next start`) and the e2e server, "development" for `next dev`.
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    : `script-src 'self' 'unsafe-inline'`;
  const connectSrc = isDev
    ? `connect-src ${withS3("'self'", "ws:", "wss:")}`
    : `connect-src ${withS3("'self'")}`;

  const csp = [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${withS3("'self'", "data:", "blob:")}`,
    `media-src ${withS3("'self'", "blob:")}`,
    `font-src 'self'`,
    connectSrc,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action ${["'self'", ...OAUTH_FORM_ACTIONS].join(" ")}`,
    `frame-ancestors 'none'`,
  ].join("; ");

  const response = NextResponse.next();

  response.headers.set("content-security-policy", csp);
  response.headers.set(
    "strict-transport-security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );

  return response;
}

export const config = {
  // Run on everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
