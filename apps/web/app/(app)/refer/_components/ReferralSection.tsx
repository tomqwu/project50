"use client";

import { useState } from "react";
import { Button } from "@project50/ui";
import { referralUrl } from "@/lib/share-links";

export interface ReferralSectionProps {
  /** The signed-in user's stable referral code. */
  code: string;
  /** How many people this user has referred. */
  referredCount: number;
}

/**
 * "Refer a friend" panel. Shows the user's shareable referral link
 * (`<origin>/?ref=<code>`) and how many people they've referred, with a copy
 * button. The absolute origin is resolved on the client at copy time so the
 * server render stays origin-agnostic.
 */
export function ReferralSection({ code, referredCount }: ReferralSectionProps) {
  const [copied, setCopied] = useState(false);
  // Relative form for display (origin-agnostic SSR); the absolute URL is built
  // on the client at copy time. Both derive from the shared referralUrl helper.
  const relativeLink = referralUrl("", code);

  async function handleCopy() {
    const url = referralUrl(window.location.origin, code);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      data-testid="referral-section"
      style={{
        padding: "24px 32px",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "20px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text)",
          margin: 0,
        }}
      >
        Refer a friend
      </h2>

      <p
        style={{
          fontFamily: "var(--font-body, system-ui)",
          fontSize: "14px",
          color: "var(--text-muted, var(--text))",
          margin: 0,
        }}
      >
        Share your link. When a friend signs up with it, we&apos;ll count them
        as your referral.
      </p>

      <div
        data-testid="referral-link"
        style={{
          fontFamily: "var(--font-body, system-ui)",
          fontSize: "14px",
          padding: "12px 16px",
          borderRadius: "8px",
          border: "1px solid var(--hairline)",
          color: "var(--text)",
          wordBreak: "break-all",
        }}
      >
        {relativeLink}
      </div>

      <Button type="button" variant="primary" onClick={handleCopy}>
        {copied ? "Copied" : "Copy link"}
      </Button>

      <p
        data-testid="referral-count"
        style={{
          fontFamily: "var(--font-body, system-ui)",
          fontSize: "14px",
          color: "var(--text-muted, var(--text))",
          margin: 0,
        }}
      >
        {referredCount === 1
          ? "You've referred 1 person."
          : `You've referred ${referredCount} people.`}
      </p>
    </section>
  );
}
