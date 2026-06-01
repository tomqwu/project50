"use client";

import { signIn } from "next-auth/react";

interface SignInButtonsProps {
  e2eEnabled?: boolean;
}

export function SignInButtons({ e2eEnabled = false }: SignInButtonsProps) {
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
              handle: `e2e-${Date.now()}`,
            })
          }
          style={{ ...providerButtonStyle, background: "var(--surface2)" }}
          data-testid="signin-e2e"
        >
          E2E Sign In (test only)
        </button>
      )}
    </div>
  );
}

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
