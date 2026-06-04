"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

interface SignInButtonsProps {
  e2eEnabled?: boolean;
  /** Show the email magic-link option only when email is configured (#50). */
  emailEnabled?: boolean;
}

type EmailStatus = "idle" | "sending" | "sent" | "error";

export function SignInButtons({
  e2eEnabled = false,
  emailEnabled = false,
}: SignInButtonsProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<EmailStatus>("idle");

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: boolean };
      setStatus(res.ok && data.sent ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        width: "100%",
        maxWidth: "360px",
      }}
    >
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/" })}
        style={providerButtonStyle}
        data-testid="signin-google"
      >
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => signIn("facebook", { callbackUrl: "/" })}
        style={providerButtonStyle}
        data-testid="signin-facebook"
      >
        Continue with Facebook
      </button>
      {e2eEnabled && (
        <button
          type="button"
          onClick={() =>
            signIn("e2e", {
              callbackUrl: "/",
              handle: "demo",
            })
          }
          style={{ ...providerButtonStyle, background: "var(--surface2)" }}
          data-testid="signin-e2e"
        >
          Continue as demo account
        </button>
      )}
      {emailEnabled && (
        <form onSubmit={onEmailSubmit} data-testid="signin-email-form">
          {status === "sent" ? (
            <p data-testid="signin-email-sent" style={emailNoteStyle}>
              Check your inbox for a sign-in link.
            </p>
          ) : (
            <>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                data-testid="signin-email-input"
                style={emailInputStyle}
              />
              <button
                type="submit"
                disabled={status === "sending"}
                style={{ ...providerButtonStyle, background: "var(--surface2)", marginTop: "8px" }}
                data-testid="signin-email-submit"
              >
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
              {status === "error" && (
                <p data-testid="signin-email-error" style={{ ...emailNoteStyle, color: "var(--danger, #d33)" }}>
                  Couldn&apos;t send the link. Check the address and try again.
                </p>
              )}
            </>
          )}
        </form>
      )}
    </div>
  );
}

const emailInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px 20px",
  borderRadius: "16px",
  border: "1px solid var(--hairline)",
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "var(--font-body, system-ui, sans-serif)",
  fontSize: "16px",
  boxSizing: "border-box",
};

const emailNoteStyle: React.CSSProperties = {
  fontFamily: "var(--font-body, system-ui, sans-serif)",
  fontSize: "13px",
  color: "var(--muted)",
  margin: "8px 0 0",
  textAlign: "center",
};

const providerButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px 24px",
  borderRadius: "16px",
  border: "1px solid var(--hairline)",
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "var(--font-body, system-ui, sans-serif)",
  fontSize: "16px",
  fontWeight: 600,
  cursor: "pointer",
  width: "100%",
};
