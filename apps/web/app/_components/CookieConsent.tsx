"use client";

import { useEffect, useState } from "react";

/** localStorage key holding the user's tracking-consent choice. */
export const CONSENT_KEY = "p50_cookie_consent";

export type ConsentChoice = "accepted" | "rejected";

/**
 * Read the persisted consent choice.
 *
 * Returns `null` when no (valid) choice has been made yet, or when
 * localStorage is unavailable (SSR, privacy mode, quota errors). Callers
 * should treat `null` as "no consent given".
 */
export function getConsent(): ConsentChoice | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Whether the user has opted in to non-essential tracking/analytics.
 *
 * Future analytics integrations MUST gate on this — essential cookies
 * (e.g. the auth session) do not require consent and are not covered here.
 */
export function hasTrackingConsent(): boolean {
  return getConsent() === "accepted";
}

function persist(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Persistence is best-effort; failing to store must not break the UI.
  }
}

/**
 * CookieConsent — a fixed bottom banner letting users accept or reject
 * non-essential tracking. The choice is persisted in localStorage and the
 * banner stays hidden once any choice exists.
 */
export function CookieConsent() {
  // Start hidden to avoid an SSR/first-paint flash; reveal after mount only
  // when no prior choice exists.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);

  if (!visible) return null;

  function choose(choice: ConsentChoice) {
    persist(choice);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: "var(--card, #1c1a1e)",
        borderTop: "1px solid var(--hairline, rgba(242,240,236,0.08))",
        color: "var(--text, #f2f0ec)",
        fontFamily: "var(--font-body, system-ui)",
        padding: "16px 20px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
      }}
    >
      <p style={{ margin: 0, maxWidth: "640px", lineHeight: 1.5, flex: "1 1 260px" }}>
        We use essential cookies to keep you signed in. With your consent we
        also use non-essential cookies for analytics.{" "}
        <a
          href="/legal/privacy"
          style={{ color: "var(--accent, #d6ff3f)", textDecoration: "underline" }}
        >
          Privacy policy
        </a>
      </p>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => choose("rejected")}
          style={{
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            fontWeight: 600,
            padding: "10px 16px",
            borderRadius: "8px",
            cursor: "pointer",
            background: "transparent",
            color: "var(--text, #f2f0ec)",
            border: "1px solid var(--hairline, rgba(242,240,236,0.2))",
          }}
        >
          Reject non-essential
        </button>
        <button
          type="button"
          onClick={() => choose("accepted")}
          style={{
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            fontWeight: 700,
            padding: "10px 16px",
            borderRadius: "8px",
            cursor: "pointer",
            background: "var(--accent, #d6ff3f)",
            color: "#121013",
            border: "none",
          }}
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
