"use client";

import { useEffect, useRef } from "react";

/**
 * Fire-and-forget referral claim.
 *
 * Rendered by the authenticated app layout ONLY when a pending `p50_ref` cookie
 * is present (the layout, an RSC, detects it — the cookie is httpOnly so the
 * client can't read it directly). On mount it POSTs to `/api/referral/claim`
 * with an empty body; the route reads the cookie, records the referral via the
 * canonical `recordReferral` path, and clears the cookie. Best-effort: a failed
 * request is swallowed (the user is signed in either way). Renders no UI.
 */
export function ReferralClaim() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void fetch("/api/referral/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {
      // Best-effort attribution — never surface to the user.
    });
  }, []);
  return null;
}
