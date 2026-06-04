"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

interface SignInButtonsProps {
  e2eEnabled?: boolean;
  /** Show the email magic-link option only when email is configured (#50). */
  emailEnabled?: boolean;
}

type EmailStatus = "idle" | "sending" | "sent" | "error";

/** Google's multi-color "G" mark. */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Facebook "f" mark (white, for the blue button). */
function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true" focusable="false">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

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
        gap: "14px",
        width: "100%",
        maxWidth: "360px",
      }}
    >
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="signin-provider-btn"
        style={googleButtonStyle}
        data-testid="signin-google"
      >
        <GoogleIcon />
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => signIn("facebook", { callbackUrl: "/" })}
        className="signin-provider-btn"
        style={facebookButtonStyle}
        data-testid="signin-facebook"
      >
        <FacebookIcon />
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
          className="signin-provider-btn"
          style={secondaryButtonStyle}
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
                className="signin-provider-btn"
                style={{ ...secondaryButtonStyle, marginTop: "8px" }}
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

// Shared shape — branded fills are layered on top per provider so each button
// is instantly recognizable. State-sensitive bits (cursor, box-shadow, hover/
// disabled) live in `.signin-provider-btn` in globals.css; keeping them OUT of
// the inline style is deliberate so the class's :hover/:disabled rules win
// (inline styles would otherwise outrank the class).
const baseButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  padding: "16px 24px",
  borderRadius: "16px",
  border: "1px solid transparent",
  fontFamily: "var(--font-body, system-ui, sans-serif)",
  fontSize: "16px",
  fontWeight: 700,
  width: "100%",
};

const googleButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: "#ffffff",
  color: "#1f1f1f",
  border: "1px solid #dadce0",
};

const facebookButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: "#1877F2",
  color: "#ffffff",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: "var(--card)",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  fontWeight: 600,
};
