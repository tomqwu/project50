// Sentry edge runtime configuration (middleware + edge routes).
//
// OPT-IN: Sentry.init runs ONLY when SENTRY_DSN is set. With no DSN — the default
// in dev, CI, and e2e — this is a complete no-op. Imported from instrumentation.ts
// during the `register` hook when NEXT_RUNTIME === "edge".
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "1.0"),
    debug: process.env.SENTRY_DEBUG === "1",
  });
}
