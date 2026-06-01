"use client";

import { useState } from "react";

export interface CheerButtonProps {
  activityId: string;
  count: number;
}

export function CheerButton({ activityId, count }: CheerButtonProps) {
  const [cheerCount, setCheerCount] = useState(count);
  const [cheered, setCheered] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCheer() {
    setLoading(true);
    // Optimistic increment
    setCheerCount((c) => c + 1);
    setCheered(true);

    try {
      await fetch(`/api/activities/${activityId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "CHEER" }),
      });
    } catch {
      // On failure, revert optimistic update
      setCheerCount((c) => c - 1);
      setCheered(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCheer}
      disabled={cheered || loading}
      aria-label={`Cheer (${cheerCount})`}
      data-testid="cheer-button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 14px",
        borderRadius: "999px",
        border: "1px solid var(--hairline)",
        background: cheered ? "var(--accent)" : "transparent",
        color: cheered ? "var(--bg)" : "var(--muted)",
        fontFamily: "var(--font-body, system-ui)",
        fontSize: "13px",
        fontWeight: 600,
        cursor: cheered ? "default" : "pointer",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      <span aria-hidden>+1</span>
      <span data-testid="cheer-count">{cheerCount}</span>
    </button>
  );
}
