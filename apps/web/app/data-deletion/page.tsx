import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "Data Deletion — Project 50",
  description:
    "How to delete your Project 50 account and all associated data, self-serve or by request.",
};

const LAST_UPDATED = "June 4, 2026";
const PRIVACY_EMAIL = "privacy@project50.fit";

const h2: React.CSSProperties = {
  fontFamily: "var(--font-display, 'Anton', sans-serif)",
  fontSize: "24px",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  margin: "40px 0 12px",
  color: "var(--text)",
};

const p: React.CSSProperties = {
  margin: "0 0 16px",
  color: "var(--text)",
};

const ol: React.CSSProperties = {
  margin: "0 0 16px",
  paddingLeft: "24px",
  color: "var(--text)",
};

const ul: React.CSSProperties = {
  margin: "0 0 16px",
  paddingLeft: "24px",
  color: "var(--text)",
};

/**
 * Public "How to delete your data" page. This is the URL Facebook's
 * "Data deletion instructions" field points to. It documents the self-serve
 * in-app deletion (Settings → Delete Account) and the email fallback. Lives
 * outside the (app) auth group so it is reachable without signing in.
 */
export default function DataDeletionPage() {
  return (
    <LegalPage title="How to delete your data" lastUpdated={LAST_UPDATED}>
      <p style={p}>
        You can permanently delete your Project 50 account and all of your data
        at any time. Deletion is irreversible.
      </p>

      <h2 style={h2}>Delete your account in the app</h2>
      <p style={p}>
        The fastest way is to do it yourself, directly in Project 50:
      </p>
      <ol style={ol}>
        <li>Sign in to Project 50.</li>
        <li>
          Go to <strong>Settings → Delete Account</strong>.
        </li>
        <li>
          Type your handle to confirm, then choose <strong>Delete</strong>.
        </li>
      </ol>
      <p style={p}>
        Your account is deleted immediately and you are signed out. This action
        cannot be undone.
      </p>

      <h2 style={h2}>What gets deleted</h2>
      <p style={p}>
        Deleting your account permanently removes your profile and everything
        associated with it, including:
      </p>
      <ul style={ul}>
        <li>your profile (handle, display name, avatar);</li>
        <li>
          your identity links to Google and Facebook (we no longer recognise you
          on sign-in);
        </li>
        <li>your challenges and their settings;</li>
        <li>
          your activity logs, notes, mood entries, day statuses, milestones,
          rule checks, and recaps;
        </li>
        <li>photos and other media you uploaded;</li>
        <li>your follows, in both directions, and your reactions and comments.</li>
      </ul>
      <p style={p}>
        See our{" "}
        <Link href="/privacy" style={{ color: "var(--accent)" }}>
          Privacy Policy
        </Link>{" "}
        for more on retention.
      </p>

      <h2 style={h2}>Request deletion by email</h2>
      <p style={p}>
        If you can&rsquo;t sign in or would prefer we handle it, email{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "var(--accent)" }}>
          {PRIVACY_EMAIL}
        </a>{" "}
        from the address or account you use, and we will delete your account and
        all associated data. We may ask you to verify your identity before
        completing the request.
      </p>
    </LegalPage>
  );
}
