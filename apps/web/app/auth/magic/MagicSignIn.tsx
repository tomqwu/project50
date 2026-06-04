"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

interface MagicSignInProps {
  token?: string;
}

type Status = "verifying" | "error";

/**
 * Client component for the magic-link landing page (#50). On mount it calls
 * signIn("magic-link", { token }) which drives the env-gated Credentials provider
 * in auth.ts → verifyMagicLink. On success NextAuth redirects to `/`; on failure
 * (missing/invalid/expired/used token) we show an error with a path back to
 * sign-in. Rides the existing JWT session machinery — no DB adapter.
 */
export function MagicSignIn({ token }: MagicSignInProps) {
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  // Guard against double-invocation (React 18 StrictMode mounts effects twice):
  // the token is single-use, so a second signIn would always fail.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    // redirect:false so the call resolves with a typed result we can branch on;
    // on success we navigate ourselves (keeps the error path renderable instead
    // of NextAuth bouncing to its own error page).
    void signIn("magic-link", { token, redirect: false }).then(
      (res) => {
        if (res?.ok && !res.error) {
          window.location.assign("/");
        } else {
          setStatus("error");
        }
      },
      () => setStatus("error"),
    );
  }, [token]);

  return (
    <main
      data-testid="magic-signin"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "24px",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-body, system-ui, sans-serif)",
        textAlign: "center",
      }}
    >
      {status === "verifying" ? (
        <p data-testid="magic-verifying" style={{ fontSize: "16px" }}>
          Signing you in…
        </p>
      ) : (
        <>
          <p data-testid="magic-error" style={{ fontSize: "16px" }}>
            This sign-in link is invalid or has expired.
          </p>
          <a
            href="/signin"
            data-testid="magic-retry"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            Back to sign in
          </a>
        </>
      )}
    </main>
  );
}
