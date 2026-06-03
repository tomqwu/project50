import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Headline describing the empty condition. */
  title: string;
  /** Optional supporting copy. */
  message?: string;
  /** Optional call-to-action node (e.g. a link/button). */
  action?: ReactNode;
}

/**
 * EmptyState — a centered placeholder for "nothing here yet" surfaces.
 *
 * Mirrors the muted, centered styling used by DashboardView/FeedView empties.
 */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
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
      {action && <div style={{ marginTop: message ? 0 : "24px" }}>{action}</div>}
    </div>
  );
}
