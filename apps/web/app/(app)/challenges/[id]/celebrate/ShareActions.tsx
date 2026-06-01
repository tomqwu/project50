"use client";

import { useState } from "react";
import { Button } from "@project50/ui";

export interface ShareActionsProps {
  challengeId: string;
  shareId: string;
  visibility: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
}

export function ShareActions({ challengeId, shareId, visibility }: ShareActionsProps) {
  const [copied, setCopied] = useState(false);

  const isPublic = visibility === "PUBLIC";

  async function handleCopyLink() {
    const url = `${window.location.origin}/c/${shareId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    const url = `${window.location.origin}/c/${shareId}`;
    if (navigator.share) {
      await navigator.share({ url });
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      style={{
        marginTop: "40px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* Save image — link to card route, download attribute */}
      {isPublic ? (
        <a
          href={`/api/challenges/${challengeId}/card`}
          download
          data-testid="save-image-link"
          style={{ textDecoration: "none" }}
        >
          <Button variant="primary">Save image</Button>
        </a>
      ) : (
        <div data-testid="save-image-disabled">
          <Button variant="primary" disabled>
            Save image
          </Button>
          <p
            style={{
              fontFamily: "var(--font-body, system-ui)",
              fontSize: "12px",
              color: "var(--muted)",
              margin: "4px 0 0",
            }}
            data-testid="save-image-hint"
          >
            Make public to share
          </p>
        </div>
      )}

      {/* Public link — copy URL */}
      <div data-testid="copy-link-button">
        <Button
          variant="ghost"
          onClick={handleCopyLink}
          disabled={!isPublic}
        >
          {copied ? "Copied" : "Public link"}
        </Button>
      </div>

      {/* Share — Web Share API with clipboard fallback */}
      <div data-testid="share-button">
        <Button
          variant="ghost"
          onClick={handleShare}
          disabled={!isPublic}
        >
          Share
        </Button>
      </div>
    </div>
  );
}
