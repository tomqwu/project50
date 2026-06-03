// Next.js 15 server/edge instrumentation hook.
//
// Sentry is OPT-IN: the per-runtime config files only call Sentry.init when
// SENTRY_DSN is set, so importing them with no DSN is a harmless no-op. We still
// guard the dynamic import behind a DSN check to avoid loading the SDK at all in
// the common (DSN-unset) case — keeping dev/CI/e2e startup untouched.
export async function register() {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Forwards nested React Server Component errors to Sentry. Re-exporting the SDK's
// helper is safe with no DSN: with Sentry uninitialised it is effectively a no-op.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
