"use client";

import { useState } from "react";
import { Button } from "@project50/ui";

/**
 * Self-serve GDPR data export. Lets the signed-in user download a
 * machine-readable JSON file containing all of their personal data. Clicking
 * the button GETs `/api/account/export`, reads the response as a Blob, and
 * triggers a browser download via a temporary object URL. Errors surface inline
 * so the user can retry.
 */
export function DataExportSection() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (downloading) return;
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch("/api/account/export", { method: "GET" });
      if (!res.ok) throw new Error(`export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "project50-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section
      data-testid="data-export-section"
      style={{
        padding: "24px 32px",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        borderTop: "1px solid var(--hairline)",
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
        Your data
      </h2>

      <p
        style={{
          fontFamily: "var(--font-body, system-ui)",
          fontSize: "14px",
          color: "var(--text-muted, var(--text))",
          margin: 0,
        }}
      >
        Download a machine-readable copy of all your personal data — your
        profile, challenges, activities, day statuses, rule checks, follows, and
        reactions — as a JSON file.
      </p>

      {error && (
        <p
          data-testid="export-error"
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(229,72,77,0.12)",
            border: "1px solid rgba(229,72,77,0.3)",
            color: "var(--danger)",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            margin: 0,
          }}
        >
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={handleDownload}
        disabled={downloading}
      >
        {downloading ? "Preparing…" : "Download my data"}
      </Button>
    </section>
  );
}
