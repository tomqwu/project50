"use client";

import { useState, useTransition } from "react";
import { Button } from "@project50/ui";

export interface ModerationActionsProps {
  /** The id of the user being blocked/reported. */
  targetId: string;
  /** Whether the viewer has already blocked the target on first render. */
  initialBlocked?: boolean;
}

/**
 * Block/unblock and report affordances for a public profile.
 *
 * - Block toggles a Block edge via `/api/users/[id]/block` (POST/DELETE),
 *   flipping optimistically and reverting if the request fails.
 * - Report prompts for a reason and POSTs a USER report to `/api/reports`.
 *   It briefly shows a confirmation, and surfaces an error if the call fails.
 */
export function ModerationActions({
  targetId,
  initialBlocked = false,
}: ModerationActionsProps) {
  const [blocked, setBlocked] = useState(initialBlocked);
  const [status, setStatus] = useState<"idle" | "reported" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  function toggleBlock() {
    const next = !blocked;
    setBlocked(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/users/${targetId}/block`, {
          method: next ? "POST" : "DELETE",
        });
        if (!res.ok) setBlocked(!next);
      } catch {
        setBlocked(!next);
      }
    });
  }

  function report() {
    const reason = window.prompt("Why are you reporting this user?");
    if (reason === null) return;
    if (reason.trim() === "") return;

    setStatus("idle");
    startTransition(async () => {
      try {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            targetType: "USER",
            targetId,
            reason,
          }),
        });
        setStatus(res.ok ? "reported" : "error");
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <div
      style={{ display: "flex", gap: "8px", alignItems: "center" }}
      data-testid="moderation-actions"
    >
      <Button
        type="button"
        variant="ghost"
        disabled={isPending}
        onClick={toggleBlock}
      >
        {blocked ? "Unblock" : "Block"}
      </Button>
      <Button type="button" variant="ghost" disabled={isPending} onClick={report}>
        Report
      </Button>
      {status === "reported" && (
        <span data-testid="report-confirmation" style={{ fontSize: "13px", color: "var(--muted)" }}>
          Reported
        </span>
      )}
      {status === "error" && (
        <span data-testid="report-error" style={{ fontSize: "13px", color: "var(--danger, #c00)" }}>
          Couldn&apos;t report
        </span>
      )}
    </div>
  );
}
