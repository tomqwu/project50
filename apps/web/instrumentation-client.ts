// Next.js 15 client instrumentation (runs in the browser).
//
// OPT-IN: Sentry.init runs ONLY when NEXT_PUBLIC_SENTRY_DSN is set. With no DSN —
// the default in dev, CI, and e2e — this is a complete no-op (no SDK init, no
// network, no errors).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "1.0",
    ),
    // Session Replay is disabled by default; opt in per environment if desired.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1",
  });
}

// Instruments App Router client-side navigations. The SDK helper is a no-op when
// Sentry was not initialised (DSN unset), so this export is always safe.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
