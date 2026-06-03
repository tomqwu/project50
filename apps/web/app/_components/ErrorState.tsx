"use client";

import { Button } from "@project50/ui";

export interface ErrorStateProps {
  /** Headline for the error surface. */
  title?: string;
  /** Optional supporting copy explaining the failure. */
  message?: string;
  /** When provided, renders a "Try again" button wired to this handler. */
  onRetry?: () => void;
}

/**
 * ErrorState — a centered failure surface with an optional retry action.
 *
 * Used by App Router error boundaries (pass reset as onRetry) and ad-hoc
 * error UIs. Styled to match the muted, centered empty/loading states.
 */
export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      style={{
        padding: "64px 32px",
        maxWidth: "420px",
        margin: "0 auto",
        textAlign: "center",
        fontFamily: "var(--font-body, system-ui)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "22px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text)",
          margin: "0 0 8px",
        }}
      >
        {title}
      </h2>
      {message && (
        <p style={{ color: "var(--muted)", margin: "0 0 24px", lineHeight: 1.5 }}>
          {message}
        </p>
      )}
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
