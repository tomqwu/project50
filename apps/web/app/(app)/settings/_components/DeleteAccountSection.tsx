"use client";

import { useState } from "react";
import { Button, Label } from "@project50/ui";
import { deleteAccountAction } from "../actions";

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

/**
 * Danger-zone control for permanently deleting the signed-in user's account and
 * all of their data. The destructive action is gated behind a confirmation: the
 * user must type their exact handle before the delete button enables. On
 * confirm it invokes {@link deleteAccountAction}, which deletes the account and
 * signs the user out (redirecting to /signin), so a successful call never
 * returns here.
 */
export function DeleteAccountSection({ handle }: { handle: string }) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirm.trim() === handle;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || deleting) return;

    setError(null);
    setDeleting(true);
    try {
      await deleteAccountAction();
      // On success the action redirects to /signin and this code is unreached.
    } catch {
      setError("Something went wrong. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="delete-account-form"
      style={{
        padding: "24px 32px 32px",
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
          color: "var(--danger)",
          margin: 0,
        }}
      >
        Danger zone — Delete account
      </h2>

      <p
        style={{
          fontFamily: "var(--font-body, system-ui)",
          fontSize: "14px",
          color: "var(--text-muted, var(--text))",
          margin: 0,
        }}
      >
        This permanently deletes your account and all of your data — challenges,
        activities, follows, and more. This cannot be undone. To confirm, type
        your handle <strong>{handle}</strong> below.
      </p>

      <div>
        <Label>Type your handle to confirm</Label>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          data-testid="delete-confirm-input"
          placeholder={handle}
          autoComplete="off"
          style={inputStyle}
        />
      </div>

      {error && (
        <p
          data-testid="delete-error"
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
        type="submit"
        variant="danger"
        data-testid="delete-account-button"
        disabled={!confirmed || deleting}
      >
        {deleting ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
