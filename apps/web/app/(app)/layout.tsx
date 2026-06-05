import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth-guard";
import { REFERRAL_COOKIE } from "@/lib/referral-capture";
import { SignOutButton } from "./_components/SignOutButton";
import { SkipLink } from "./_components/SkipLink";
import { ReferralClaim } from "./_components/ReferralClaim";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireAuth();

  // A signed-out invitee who arrived via `/?ref=<code>` had the code captured
  // into the httpOnly `p50_ref` cookie by middleware (it survives the OAuth
  // round-trip). Now that they're authenticated, trigger the one-shot claim
  // (the client POSTs to /api/referral/claim, which reads + clears the cookie).
  const hasPendingReferral = Boolean(
    (await cookies()).get(REFERRAL_COOKIE)?.value,
  );

  // App-shell content column — keeps the nav + page content in a centered,
  // app-like column instead of sprawling edge-to-edge on wide viewports.
  const shellMaxWidth = 600;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* First focusable element — lets keyboard users skip the nav. */}
      <SkipLink />
      {hasPendingReferral ? <ReferralClaim /> : null}
      <nav
        aria-label="Primary"
        style={{ borderBottom: "1px solid var(--hairline)", padding: "0 24px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            // Wrap the nav items onto multiple rows on narrow viewports so the
            // full link set never overflows horizontally at ~375px wide.
            flexWrap: "wrap",
            gap: "16px 24px",
            padding: "20px 0",
            maxWidth: shellMaxWidth,
            margin: "0 auto",
          }}
        >
        <Link
          href="/"
          aria-label="project50 home"
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "22px",
            letterSpacing: "0.05em",
            color: "var(--accent)",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          project50
        </Link>
        <Link
          href="/"
          style={{
            color: "var(--text)",
            textDecoration: "none",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
          }}
        >
          Dashboard
        </Link>
        <Link
          href="/feed"
          style={{
            color: "var(--text)",
            textDecoration: "none",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
          }}
        >
          Feed
        </Link>
        <Link
          href="/challenges/new"
          style={{
            color: "var(--text)",
            textDecoration: "none",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
          }}
        >
          New
        </Link>
        <Link
          href="/settings"
          style={{
            color: "var(--text)",
            textDecoration: "none",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
          }}
        >
          Settings
        </Link>
        <Link
          href="/help"
          style={{
            color: "var(--text)",
            textDecoration: "none",
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
          }}
        >
          Help
        </Link>
        <SignOutButton />
        </div>
      </nav>
      <main
        id="main"
        style={{
          maxWidth: shellMaxWidth,
          margin: "0 auto",
          // Keep content off the screen edges on small/mobile viewports so it
          // never touches the edge at ~375px wide.
          padding: "0 16px",
        }}
      >
        {children}
      </main>
    </div>
  );
}
