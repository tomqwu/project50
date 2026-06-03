export interface SpinnerProps {
  /** Diameter of the spinner in pixels. */
  size?: number;
  /** Accessible label announced to assistive tech. */
  label?: string;
}

/**
 * Spinner — a minimal Momentum-styled loading indicator.
 *
 * Centered in its container and announced via role="status" so screen readers
 * pick up the loading state. Uses the accent token for the active arc.
 */
export function Spinner({ size = 40, label = "Loading" }: SpinnerProps) {
  const border = Math.max(2, Math.round(size / 12));
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="spinner"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 32px",
        minHeight: "180px",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          border: `${border}px solid var(--hairline)`,
          borderTopColor: "var(--accent)",
          animation: "p50-spin 0.8s linear infinite",
        }}
      />
      <style>{"@keyframes p50-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
