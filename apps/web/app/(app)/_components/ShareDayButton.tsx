"use client";

import { useState } from "react";
import { Button } from "@project50/ui";
import { dayShareUrl, facebookSharerUrl } from "@/lib/share-links";

interface Props {
  /** The PUBLIC challenge's shareId (Project 50 runs are public by default). */
  shareId: string;
  /** 1-based day number to share. */
  dayNumber: number;
}

type CopyState = "idle" | "copied" | "error";

/**
 * "Share Day N" control for a completed day. Mirrors the tested SocialShare
 * approach: prefer the native share sheet (navigator.share), otherwise open the
 * Facebook sharer in a popup, with a separate copy-link fallback. The share URL
 * is the public per-day page, resolved against the current window origin.
 */
export function ShareDayButton({ shareId, dayNumber }: Props) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  function url(): string {
    // window.location.origin is always defined in the browser; this component is
    // client-only ("use client") so it never runs during SSR.
    return dayShareUrl(window.location.origin, shareId, dayNumber);
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
        // User dismissed or the sheet failed — fall through to the FB sharer so
        // there is always a working path.
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
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <Button variant="ghost" data-testid="share-day-button" onClick={handleShare}>
        Share Day {dayNumber}
      </Button>
      <button
        type="button"
        data-testid="copy-day-link-button"
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
