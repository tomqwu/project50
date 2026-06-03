"use client";

import { useTransition } from "react";
import { signOutAction } from "../_actions/auth";

export function SignOutButton() {
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => void signOutAction())}
      style={{
        color: "var(--text)",
        textDecoration: "none",
        fontFamily: "var(--font-body, system-ui)",
        fontSize: "14px",
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}
