"use client";

import { useState } from "react";
import { Button } from "@project50/ui";
import type { RecapKind } from "@project50/recap";

export interface RecapItem {
  id: string;
  kind: RecapKind;
  url: string;
  createdAt: Date | string;
}

export interface RecapPanelProps {
  challengeId: string;
  initialRecaps?: RecapItem[];
}

const KIND_LABELS: Record<RecapKind, string> = {
  DAY: "Day recap",
  WEEK: "Week recap",
  FIFTY: "50-day recap",
};

const KINDS: RecapKind[] = ["DAY", "WEEK", "FIFTY"];

interface GeneratedVideo {
  kind: RecapKind;
  url: string;
}

export function RecapPanelClient({ challengeId, initialRecaps = [] }: RecapPanelProps) {
  const [loadingKind, setLoadingKind] = useState<RecapKind | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [errors, setErrors] = useState<Partial<Record<RecapKind, string>>>({});
  const [shareCopied, setShareCopied] = useState<string | null>(null);

  const isLoading = loadingKind !== null;

  async function handleGenerate(kind: RecapKind) {
    setLoadingKind(kind);
    setErrors((prev) => ({ ...prev, [kind]: undefined }));

    try {
      const res = await fetch(`/api/challenges/${challengeId}/recap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Request failed");
        setErrors((prev) => ({ ...prev, [kind]: errorText || "Request failed" }));
        return;
      }

      const data = (await res.json()) as { recapId: string; kind: RecapKind; url: string };
      setGeneratedVideos((prev) => {
        // Replace existing video of same kind
        const filtered = prev.filter((v) => v.kind !== kind);
        return [...filtered, { kind, url: data.url }];
      });
    } catch {
      setErrors((prev) => ({ ...prev, [kind]: "Network error. Please try again." }));
    } finally {
      setLoadingKind(null);
    }
  }

  async function handleShare(url: string) {
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        // User cancelled or error — fall through to clipboard
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShareCopied(url);
      setTimeout(() => setShareCopied((prev) => (prev === url ? null : prev)), 2000);
    }
  }

  // Merge initial recaps with newly generated ones (generated take precedence per kind)
  const generatedKinds = new Set(generatedVideos.map((v) => v.kind));
  const initialFiltered = initialRecaps.filter((r) => !generatedKinds.has(r.kind));
  const allVideos: GeneratedVideo[] = [
    ...initialFiltered.map((r) => ({ kind: r.kind, url: r.url })),
    ...generatedVideos,
  ];

  return (
    <div
      data-testid="recap-panel"
      style={{
        marginTop: "40px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "18px",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--accent)",
          margin: "0 0 8px",
        }}
      >
        Generate Recap Video
      </h2>

      {/* Generate buttons */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        {KINDS.map((kind) => (
          <div key={kind} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div data-testid={`recap-btn-${kind}`}>
            <Button
              variant="ghost"
              disabled={isLoading}
              onClick={() => handleGenerate(kind)}
            >
              {loadingKind === kind ? "Generating…" : KIND_LABELS[kind]}
            </Button>
            </div>
            {errors[kind] && (
              <p
                data-testid={`recap-error-${kind}`}
                style={{
                  fontFamily: "var(--font-body, system-ui)",
                  fontSize: "12px",
                  color: "var(--error, #ef4444)",
                  margin: "0",
                }}
              >
                {errors[kind]}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Videos (generated + initial) */}
      {allVideos.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            marginTop: "8px",
          }}
        >
          {allVideos.map((video) => (
            <div
              key={`${video.kind}-${video.url}`}
              data-testid={`recap-video-container-${video.kind}`}
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <p
                style={{
                  fontFamily: "var(--font-body, system-ui)",
                  fontSize: "12px",
                  color: "var(--muted)",
                  margin: "0",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {KIND_LABELS[video.kind]}
              </p>

              {/* Video player */}
              <video
                controls
                data-testid="recap-video"
                src={video.url}
                style={{
                  width: "100%",
                  borderRadius: "12px",
                  background: "#000",
                }}
              />

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px" }}>
                <a
                  href={video.url}
                  download
                  data-testid="recap-download"
                  style={{ textDecoration: "none" }}
                >
                  <Button variant="ghost">Download</Button>
                </a>

                <div data-testid="recap-share">
                <Button
                  variant="ghost"
                  onClick={() => handleShare(video.url)}
                >
                  {shareCopied === video.url ? "Copied!" : "Share"}
                </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
