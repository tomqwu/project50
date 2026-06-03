"use client";

import { useState } from "react";

/**
 * "Skip to content" link — visually hidden until it receives keyboard focus,
 * then it slides into view at the top-left so keyboard and screen-reader users
 * can jump past the repeated nav straight to <main id="main">.
 *
 * It is the first focusable element in the app shell, so a single Tab from the
 * top of the page reveals it. Visibility is driven by React focus state rather
 * than a `:focus` stylesheet rule so the component stays self-contained (no
 * global CSS dependency) while remaining fully keyboard-operable.
 */
export function SkipLink() {
  const [focused, setFocused] = useState(false);

  return (
    <a
      href="#main"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: "absolute",
        left: "8px",
        top: focused ? "8px" : "-48px",
        zIndex: 100,
        padding: "10px 16px",
        borderRadius: "8px",
        background: "var(--accent)",
        color: "var(--bg)",
        fontFamily: "var(--font-body, system-ui)",
        fontSize: "14px",
        fontWeight: 600,
        textDecoration: "none",
        transition: "top 0.15s ease",
      }}
    >
      Skip to content
    </a>
  );
}
