// Sentry server-side (Node.js runtime) configuration.
//
// OPT-IN: Sentry.init runs ONLY when SENTRY_DSN is set. With no DSN — the default
// in dev, CI, and e2e — this is a complete no-op (no SDK init, no network, no
// errors). Imported from instrumentation.ts during the `register` hook.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Capture 100% of transactions by default; tune via env in production.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "1.0"),
    // Only enable verbose SDK logging when explicitly requested.
    debug: process.env.SENTRY_DEBUG === "1",
  });
}
