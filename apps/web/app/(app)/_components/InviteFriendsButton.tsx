"use client";

import { useState } from "react";
import { Button } from "@project50/ui";
import { referralUrl, facebookSharerUrl } from "@/lib/share-links";

interface Props {
  /** The signed-in user's stable referral code (`User.referralCode`). */
  referralCode: string;
}

type CopyState = "idle" | "copied" | "error";

/**
 * "Invite friends — share Project 50" control.
 *
 * Builds the user's referral URL (`<origin>/?ref=<code>`) and shares it. Mirrors
 * the tested ShareDayButton/SocialShare three-path approach: prefer the native
 * share sheet (navigator.share), otherwise open Facebook's Share Dialog in a
 * popup (the user posts the link to their feed / picks recipients in FB's own
 * UI — compliant; we never read their friend list), with a separate copy-link
 * fallback. The referral URL is resolved against the current window origin, so
 * this stays a client-only component.
 */
export function InviteFriendsButton({ referralCode }: Props) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  function url(): string {
    // window.location.origin is always defined in the browser; this component is
    // client-only ("use client") so it never runs during SSR.
    return referralUrl(window.location.origin, referralCode);
  }

  function openFacebook(target: string) {
    window.open(facebookSharerUrl(target), "_blank", "noopener,width=600,height=600");
  }

  async function handleShare() {
    const target = url();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url: target });
        return;
      } catch {
        // User dismissed or the sheet failed — fall through to the FB Share
        // Dialog so there is always a working path.
      }
    }
    openFacebook(target);
  }

  async function handleCopy() {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(url());
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div
      data-testid="invite-friends"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
    >
      <Button variant="primary" data-testid="invite-friends-button" onClick={handleShare}>
        Invite friends — share Project 50
      </Button>
      <button
        type="button"
        data-testid="invite-facebook-button"
        aria-label="Invite friends on Facebook"
        onClick={() => openFacebook(url())}
        style={{
          background: "transparent",
          border: "1px solid var(--hairline)",
          borderRadius: 8,
          color: "var(--text)",
          padding: "6px 12px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Facebook
      </button>
      <button
        type="button"
        data-testid="copy-invite-link-button"
        onClick={handleCopy}
        style={{
          background: "transparent",
          border: "1px solid var(--hairline)",
          borderRadius: 8,
          color: "var(--text)",
          padding: "6px 12px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Copy link
      </button>
      {copyState === "copied" && (
        <span style={{ fontSize: 12, color: "var(--accent, #D6FF3F)" }}>Link copied</span>
      )}
      {copyState === "error" && (
        <span style={{ fontSize: 12, color: "var(--error, #ef4444)" }}>Copy failed</span>
      )}
    </div>
  );
}
