"use client";

import { useState } from "react";
import { Button, Label } from "@project50/ui";
import { updateAccountAction } from "../actions";
import type { Account } from "@/lib/api/account";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "14px 16px",
  marginTop: "8px",
  borderRadius: "12px",
  border: "1px solid var(--hairline)",
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "var(--font-body, system-ui)",
  fontSize: "16px",
  boxSizing: "border-box",
};

/** Map a server/validation error code to a human-friendly message. */
function errorMessage(code: string): string {
  switch (code) {
    case "invalid_handle":
      return "Handle must be 3–30 letters, numbers, or underscores.";
    case "handle_taken":
      return "That handle is already taken.";
    case "invalid_display_name":
      return "Display name is required.";
    default:
      return code;
  }
}

export function AccountSettingsForm({ initial }: { initial: Account }) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [handle, setHandle] = useState(initial.handle);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmedName = displayName.trim();
    const trimmedHandle = handle.trim();

    if (!trimmedName) {
      setError(errorMessage("invalid_display_name"));
      return;
    }
    if (!trimmedHandle) {
      setError(errorMessage("invalid_handle"));
      return;
    }

    setSaving(true);
    try {
      const result = await updateAccountAction({
        displayName: trimmedName,
        handle: trimmedHandle,
      });
      if (result.ok) {
        setDisplayName(result.account.displayName);
        setHandle(result.account.handle);
        setSuccess(true);
      } else {
        setError(errorMessage(result.error));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "32px",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "28px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text)",
          margin: 0,
        }}
      >
        Settings
      </h1>

      <div>
        <Label>Display name</Label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          data-testid="displayName-input"
          placeholder="Your name"
          style={inputStyle}
        />
      </div>

      <div>
        <Label>Handle</Label>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          data-testid="handle-input"
          placeholder="your_handle"
          style={inputStyle}
        />
      </div>

      {error && (
        <p
          data-testid="form-error"
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

      {success && (
        <p
          data-testid="form-success"
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(48,164,108,0.12)",
            border: "1px solid rgba(48,164,108,0.3)",
            color: "var(--accent)",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            margin: 0,
          }}
        >
          Saved.
        </p>
      )}

      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
