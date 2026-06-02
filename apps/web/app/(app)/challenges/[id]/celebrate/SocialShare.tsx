"use client";

import { useState } from "react";
import { Button } from "@project50/ui";
import type { Capability, AssetKind, PublishResult } from "@/lib/publish/types";

export interface SocialShareProps {
  challengeId: string;
  hasRecap: boolean;
  isPublic: boolean;
  capabilities: Capability[];
}

type AssetToggle = "IMAGE" | "VIDEO";

type PlatformStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success"; result: PublishResult }
  | { state: "error"; message: string };

const PLATFORM_DISPLAY: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  WECHAT: "WeChat",
};

// Exclude the virtual WEBSHARE platform — it is a delivery method, not a button.
const EXCLUDED_PLATFORMS = new Set(["WEBSHARE"]);

export function SocialShare({
  challengeId,
  hasRecap,
  isPublic,
  capabilities,
}: SocialShareProps) {
  const [selectedAsset, setSelectedAsset] = useState<AssetToggle>("IMAGE");
  const [platformStatus, setPlatformStatus] = useState<
    Record<string, PlatformStatus>
  >({});

  const socialCapabilities = capabilities.filter(
    (c) => !EXCLUDED_PLATFORMS.has(c.platform),
  );

  const imageDisabled = !isPublic;
  const videoDisabled = !hasRecap;

  function handleAssetToggle(kind: AssetToggle) {
    // Don't allow selecting a disabled option
    if (kind === "IMAGE" && imageDisabled) return;
    if (kind === "VIDEO" && videoDisabled) return;
    setSelectedAsset(kind);
  }

  async function handlePlatformClick(platform: string) {
    const current = platformStatus[platform];
    if (current?.state === "loading") return;

    setPlatformStatus((prev) => ({ ...prev, [platform]: { state: "loading" } }));

    try {
      const res = await fetch(`/api/challenges/${challengeId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          assetKind: selectedAsset as AssetKind,
        }),
      });

      const result = (await res.json()) as PublishResult & { error?: string };

      if (!res.ok || !result.ok) {
        setPlatformStatus((prev) => ({
          ...prev,
          [platform]: {
            state: "error",
            message: result.error ?? `Error ${res.status}`,
          },
        }));
        return;
      }

      // Handle by method — NEVER show "Posted!" for non-API results
      if (result.method === "WEBSHARE") {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({ url: result.shareUrl ?? "" });
        } else {
          await navigator.clipboard.writeText(result.shareUrl ?? "");
        }
      } else if (result.method === "DEEPLINK") {
        window.open(result.shareUrl, "_blank", "noopener");
      }
      // For API method — just show success with externalUrl

      setPlatformStatus((prev) => ({
        ...prev,
        [platform]: { state: "success", result },
      }));
    } catch (err) {
      setPlatformStatus((prev) => ({
        ...prev,
        [platform]: {
          state: "error",
          message: err instanceof Error ? err.message : "Network error",
        },
      }));
    }
  }

  function getButtonLabel(cap: Capability): string {
    if (cap.apiAvailable) {
      return `Post to ${PLATFORM_DISPLAY[cap.platform] ?? cap.platform}`;
    }
    return PLATFORM_DISPLAY[cap.platform] ?? cap.platform;
  }

  function getButtonSubtitle(cap: Capability): string | null {
    if (cap.apiAvailable) return null;
    return cap.reason ?? "Opens share";
  }

  function getStatusText(platform: string, result: PublishResult): string {
    if (result.method === "API") {
      return "Posted!";
    }
    if (result.method === "WEBSHARE") {
      return "Shared via your device";
    }
    // DEEPLINK
    return "Opening share…";
  }

  return (
    <div
      data-testid="social-share-panel"
      style={{
        marginTop: "32px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "14px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted)",
          margin: "0",
        }}
      >
        Share to Social
      </h3>

      {/* Asset toggle */}
      <div
        data-testid="asset-toggle"
        style={{ display: "flex", gap: "8px", alignItems: "center" }}
      >
        <button
          data-testid="asset-image"
          aria-disabled={imageDisabled}
          onClick={() => handleAssetToggle("IMAGE")}
          aria-pressed={selectedAsset === "IMAGE"}
          style={{
            padding: "6px 14px",
            borderRadius: "999px",
            border: `1px solid ${selectedAsset === "IMAGE" ? "var(--accent)" : "var(--border, #333)"}`,
            background: selectedAsset === "IMAGE" ? "var(--accent)" : "transparent",
            color: selectedAsset === "IMAGE" ? "var(--bg, #000)" : "var(--text)",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: imageDisabled ? "not-allowed" : "pointer",
            opacity: imageDisabled ? 0.4 : 1,
          }}
        >
          Image card
        </button>
        <button
          data-testid="asset-video"
          aria-disabled={videoDisabled}
          onClick={() => handleAssetToggle("VIDEO")}
          aria-pressed={selectedAsset === "VIDEO"}
          style={{
            padding: "6px 14px",
            borderRadius: "999px",
            border: `1px solid ${selectedAsset === "VIDEO" ? "var(--accent)" : "var(--border, #333)"}`,
            background: selectedAsset === "VIDEO" ? "var(--accent)" : "transparent",
            color: selectedAsset === "VIDEO" ? "var(--bg, #000)" : "var(--text)",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: videoDisabled ? "not-allowed" : "pointer",
            opacity: videoDisabled ? 0.4 : 1,
          }}
        >
          Recap video
        </button>
      </div>

      {/* Hint when image is disabled */}
      {imageDisabled && (
        <p
          data-testid="image-disabled-hint"
          style={{
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "12px",
            color: "var(--muted)",
            margin: "-12px 0 0",
          }}
        >
          Make the challenge public to share the card
        </p>
      )}

      {/* Platform buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {socialCapabilities.map((cap) => {
          const status = platformStatus[cap.platform] ?? { state: "idle" };
          const isLoading = status.state === "loading";
          const label = getButtonLabel(cap);
          const subtitle = getButtonSubtitle(cap);
          const isImageSelected = selectedAsset === "IMAGE";
          // Only disable the button when the image asset is unavailable.
          // The in-flight guard in handlePlatformClick prevents duplicate fetches
          // while loading; the button remains interactive so the guard is reachable.
          const platformDisabled = isImageSelected && imageDisabled;

          return (
            <div
              key={cap.platform}
              data-testid={`platform-${cap.platform}`}
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <Button
                variant="ghost"
                disabled={platformDisabled}
                onClick={() => handlePlatformClick(cap.platform)}
              >
                {isLoading ? "Sharing…" : label}
              </Button>
              {subtitle && !isLoading && status.state === "idle" && (
                <p
                  data-testid={`platform-subtitle-${cap.platform}`}
                  style={{
                    fontFamily: "var(--font-body, system-ui)",
                    fontSize: "11px",
                    color: "var(--muted)",
                    margin: "0 0 0 4px",
                  }}
                >
                  {subtitle}
                </p>
              )}
              {status.state === "success" && (
                <p
                  data-testid={`platform-success-${cap.platform}`}
                  style={{
                    fontFamily: "var(--font-body, system-ui)",
                    fontSize: "12px",
                    color: "var(--accent)",
                    margin: "0 0 0 4px",
                  }}
                >
                  {getStatusText(cap.platform, status.result)}
                  {status.result.method === "API" && status.result.externalUrl && (
                    <>
                      {" "}
                      <a
                        href={status.result.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`platform-external-link-${cap.platform}`}
                      >
                        View post
                      </a>
                    </>
                  )}
                </p>
              )}
              {status.state === "error" && (
                <p
                  data-testid={`platform-error-${cap.platform}`}
                  style={{
                    fontFamily: "var(--font-body, system-ui)",
                    fontSize: "12px",
                    color: "var(--error, #ef4444)",
                    margin: "0 0 0 4px",
                  }}
                >
                  {status.message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
