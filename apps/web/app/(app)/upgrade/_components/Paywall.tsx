"use client";

import { useState } from "react";
import { Button, Card } from "@project50/ui";
import type { Entitlement } from "@/lib/api/entitlements";

export interface PaywallProps {
  /** The signed-in user's resolved entitlement (plan, status, trial end). */
  entitlement: Entitlement;
  /** Whether Stripe billing is configured server-side. When false, the
   * upgrade/manage actions are disabled and a "coming soon" note is shown. */
  billingConfigured: boolean;
  /** Optional free-trial length to request at checkout, in days. */
  trialPeriodDays?: number;
}

const FREE_FEATURES = [
  "One active 50-day challenge",
  "Daily rule check-ins",
  "Your private progress calendar",
];

const PREMIUM_FEATURES = [
  "Unlimited challenges & custom plans",
  "Public profile & social feed",
  "Recap cards & shareable wins",
  "Priority support",
];

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display, 'Anton', sans-serif)",
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  margin: 0,
};

const bodyStyle: React.CSSProperties = {
  fontFamily: "var(--font-body, system-ui)",
  color: "var(--text)",
};

/** Render a feature checklist for one plan tier. */
function FeatureList({ features }: { features: string[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: "8px" }}>
      {features.map((f) => (
        <li key={f} style={{ ...bodyStyle, fontSize: "14px", display: "flex", gap: "8px" }}>
          <span aria-hidden="true" style={{ color: "var(--accent)" }}>
            ✓
          </span>
          {f}
        </li>
      ))}
    </ul>
  );
}

/** Format a date as a human-friendly day, e.g. "July 1, 2026". */
function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Paywall / upgrade surface. Shows the free vs premium comparison and the
 * primary action for the user's current state:
 *  - premium (active/trialing) → "Manage subscription" (opens the Stripe portal),
 *    and surfaces "Trial active until …" while TRIALING.
 *  - free → "Upgrade" (starts Stripe Checkout).
 * When billing isn't configured the actions are disabled with a "coming soon"
 * note, so the page never errors without Stripe keys.
 */
export function Paywall({ entitlement, billingConfigured, trialPeriodDays }: PaywallProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isPremium, status, currentPeriodEnd } = entitlement;
  const isTrialing = status === "TRIALING";
  const trialEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;

  /**
   * POST to a billing endpoint and redirect to the returned Stripe URL. Re-entry
   * while a request is in flight is prevented by disabling the triggering button
   * (see `disabled={pending}` below), so this never runs concurrently.
   */
  async function go(endpoint: string, body?: unknown) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (!res.ok || !data.url) {
        setError("Something went wrong. Please try again.");
        setPending(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  function handleUpgrade() {
    void go("/api/billing/checkout", trialPeriodDays ? { trialPeriodDays } : undefined);
  }

  function handleManage() {
    void go("/api/billing/portal");
  }

  return (
    <section
      data-testid="paywall"
      style={{ padding: "32px 0 48px", display: "grid", gap: "24px" }}
    >
      <header style={{ display: "grid", gap: "8px" }}>
        <h1 style={{ ...headingStyle, fontSize: "28px", color: "var(--accent)" }}>
          {isPremium ? "Your plan" : "Go premium"}
        </h1>
        <p style={{ ...bodyStyle, fontSize: "15px", color: "var(--muted, var(--text))", margin: 0 }}>
          {isPremium
            ? "Thanks for supporting project50."
            : "Unlock unlimited challenges, your public profile, and more."}
        </p>
      </header>

      {isTrialing && trialEnd && (
        <p
          data-testid="trial-banner"
          style={{
            ...bodyStyle,
            margin: 0,
            padding: "12px 16px",
            borderRadius: "12px",
            background: "rgba(214,255,63,0.12)",
            border: "1px solid var(--accent)",
            fontSize: "14px",
          }}
        >
          Trial active until {formatDate(trialEnd)}.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        <Card>
          <h2 style={{ ...headingStyle, fontSize: "18px" }}>Free</h2>
          <p style={{ ...bodyStyle, fontSize: "13px", color: "var(--muted, var(--text))", margin: "4px 0 0" }}>
            The basics, free forever.
          </p>
          <FeatureList features={FREE_FEATURES} />
        </Card>

        <Card>
          <h2 style={{ ...headingStyle, fontSize: "18px", color: "var(--accent)" }}>
            Premium
          </h2>
          <p style={{ ...bodyStyle, fontSize: "13px", color: "var(--muted, var(--text))", margin: "4px 0 0" }}>
            Everything in Free, plus the good stuff.
          </p>
          <FeatureList features={PREMIUM_FEATURES} />
        </Card>
      </div>

      {error && (
        <p
          data-testid="paywall-error"
          style={{
            ...bodyStyle,
            margin: 0,
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(229,72,77,0.12)",
            border: "1px solid rgba(229,72,77,0.3)",
            color: "var(--danger)",
            fontSize: "14px",
          }}
        >
          {error}
        </p>
      )}

      <div style={{ display: "grid", gap: "8px" }}>
        {!billingConfigured ? (
          <>
            <Button variant="primary" disabled data-testid="upgrade-disabled">
              Upgrade — coming soon
            </Button>
            <p
              data-testid="billing-coming-soon"
              style={{ ...bodyStyle, fontSize: "13px", color: "var(--muted, var(--text))", margin: 0 }}
            >
              Premium isn&apos;t available just yet. Check back soon.
            </p>
          </>
        ) : isPremium ? (
          <Button
            variant="ghost"
            onClick={handleManage}
            disabled={pending}
            data-testid="manage-subscription"
          >
            {pending ? "Opening…" : "Manage subscription"}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleUpgrade}
            disabled={pending}
            data-testid="upgrade-button"
          >
            {pending ? "Redirecting…" : trialPeriodDays ? "Start free trial" : "Upgrade"}
          </Button>
        )}
      </div>
    </section>
  );
}
