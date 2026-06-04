import Link from "next/link";

/**
 * Settings entry point into billing. Links to the /upgrade paywall where the
 * user can go premium or manage an existing subscription. Kept intentionally
 * thin — the upgrade page itself decides what to show based on the user's
 * entitlement and whether billing is configured.
 */
export function BillingSection() {
  return (
    <section
      data-testid="billing-section"
      style={{
        padding: "24px 32px",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "18px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        Plan &amp; billing
      </h2>
      <p
        style={{
          fontFamily: "var(--font-body, system-ui)",
          fontSize: "14px",
          color: "var(--muted, var(--text))",
          margin: 0,
        }}
      >
        Go premium for unlimited challenges and more, or manage your current
        subscription.
      </p>
      <Link
        href="/upgrade"
        data-testid="manage-plan-link"
        style={{
          color: "var(--accent)",
          textDecoration: "none",
          fontFamily: "var(--font-body, system-ui)",
          fontSize: "14px",
          fontWeight: 600,
        }}
      >
        Manage plan →
      </Link>
    </section>
  );
}
