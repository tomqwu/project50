"use client";

import { useState } from "react";
import { Button } from "@project50/ui";
import { dayShareUrl, dayImageUrl, facebookSharerUrl } from "@/lib/share-links";

interface Props {
  /** The PUBLIC challenge's shareId (Project 50 runs are public by default). */
  shareId: string;
  /** 1-based day number to share. */
  dayNumber: number;
  /**
   * Whether the Instagram share option is offered (#285 `shareInstagram`
   * kill-switch). Resolved server-side via `isFeatureEnabled("shareInstagram")`
   * and threaded down (this is a client component). Defaults to `true` so the
   * button shows unless explicitly disabled — matching the flag's default-ON
   * state and keeping existing callers unchanged. When `false`, the Instagram
   * button (and its fallback) are omitted entirely; Facebook / copy / native
   * share are unaffected.
   */
  instagramEnabled?: boolean;
}

type CopyState = "idle" | "copied" | "error";
type InstagramState = "idle" | "pending" | "fallback";

/**
 * "Share Day N" controls for a completed day. Exposes EXPLICIT, honest options
 * that mirror the capability model in `SocialShareClient` + `lib/publish/`:
 *
 * - Generic **Share…** — native share sheet (navigator.share) with the URL,
 *   Facebook sharer popup as the universal fallback.
 * - **Facebook** — opens the Facebook sharer for the public day URL.
 * - **Instagram** — IMAGE-based and honest. Instagram has NO web "share a link"
 *   dialog, so the only compliant in-browser path is sharing the day card IMAGE
 *   via the OS share sheet (`navigator.share({ files })`). When that capability
 *   is missing (desktop, or a browser without file-share) we NEVER claim a share
 *   happened — we show an honest note plus copy-link / save-image actions.
 * - **Copy link** — clipboard fallback.
 *
 * The share URL/image are resolved against the current window origin; this is a
 * client-only component so `window` is always defined.
 */
export function ShareDayButton({ shareId, dayNumber, instagramEnabled = true }: Props) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [igState, setIgState] = useState<InstagramState>("idle");

  function url(): string {
    return dayShareUrl(window.location.origin, shareId, dayNumber);
  }

  function imageUrl(): string {
    return dayImageUrl(window.location.origin, shareId, dayNumber);
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

  function handleFacebook() {
    openFacebook(url());
  }

  /**
   * Instagram: try to share the day card IMAGE through the OS share sheet (which
   * includes Instagram on mobile). Only this image path is compliant — IG has no
   * web link-share. If we can't truthfully complete it, fall back honestly.
   */
  async function handleInstagram() {
    // Re-entrancy is prevented by disabling the button while a share is pending.
    setIgState("pending");

    const nav = navigator;

    // Need both: the ability to share files AND the share API itself.
    if (!nav.share || typeof nav.canShare !== "function") {
      setIgState("fallback");
      return;
    }

    try {
      const res = await fetch(imageUrl());
      if (!res.ok) {
        setIgState("fallback");
        return;
      }
      const blob = await res.blob();
      const file = new File([blob], `project50-day-${dayNumber}.png`, {
        type: blob.type || "image/png",
      });

      // Truthful capability probe — don't attempt a share we know will fail.
      if (!nav.canShare({ files: [file] })) {
        setIgState("fallback");
        return;
      }

      await nav.share({ files: [file] });
      // Resolved: the OS sheet handled it. We intentionally do NOT assert a
      // successful Instagram post — we cannot observe what the user did in the
      // share sheet, so claiming "Posted to Instagram" would be dishonest.
      setIgState("idle");
    } catch {
      // Dismissed, unsupported, or fetch/share failure — show the honest path.
      setIgState("fallback");
    }
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

  function handleInstagramSaveImage() {
    window.open(imageUrl(), "_blank", "noopener");
  }

  const pillStyle: React.CSSProperties = {
    background: "transparent",
    border: "1px solid var(--hairline)",
    borderRadius: 8,
    color: "var(--text)",
    padding: "6px 12px",
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Button variant="ghost" data-testid="share-day-button" onClick={handleShare}>
          Share Day {dayNumber}
        </Button>
        <button
          type="button"
          data-testid="share-facebook-button"
          aria-label={`Share Day ${dayNumber} on Facebook`}
          onClick={handleFacebook}
          style={pillStyle}
        >
          Facebook
        </button>
        {instagramEnabled && (
          <button
            type="button"
            data-testid="share-instagram-button"
            aria-label={`Share Day ${dayNumber} on Instagram`}
            aria-busy={igState === "pending"}
            disabled={igState === "pending"}
            onClick={handleInstagram}
            style={{ ...pillStyle, opacity: igState === "pending" ? 0.6 : 1 }}
          >
            {igState === "pending" ? "Sharing…" : "Instagram"}
          </button>
        )}
        <button
          type="button"
          data-testid="copy-day-link-button"
          onClick={handleCopy}
          style={pillStyle}
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

      {instagramEnabled && igState === "fallback" && (
        <div
          data-testid="instagram-fallback"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
        >
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Instagram can&apos;t share a link from the web — copy the link or save the
            image, then post it in the app.
          </span>
          <button
            type="button"
            data-testid="instagram-copy-link"
            onClick={handleCopy}
            style={pillStyle}
          >
            Copy link
          </button>
          <button
            type="button"
            data-testid="instagram-save-image"
            onClick={handleInstagramSaveImage}
            style={pillStyle}
          >
            Save image
          </button>
        </div>
      )}
    </div>
  );
}
