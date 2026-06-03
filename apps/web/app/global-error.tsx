"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary for unrecoverable React render errors that escape the
 * per-segment boundaries. Forwards the error to Sentry — a no-op when Sentry is
 * not initialised (no DSN) — and renders a minimal full-document fallback.
 *
 * Unlike segment error boundaries, global-error must render its own <html>/<body>
 * because it replaces the root layout when the layout itself fails.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
          padding: "32px",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h2>Something went wrong</h2>
        <p style={{ color: "#666" }}>
          An unexpected error occurred. Please try again.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  );
}
