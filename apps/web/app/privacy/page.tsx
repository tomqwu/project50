import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Project 50",
  description:
    "How Project 50 collects, uses, shares, and protects your personal data.",
};

const EFFECTIVE_DATE = "June 4, 2026";
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

const h3: React.CSSProperties = {
  fontFamily: "var(--font-body, system-ui)",
  fontSize: "18px",
  fontWeight: 700,
  margin: "24px 0 8px",
  color: "var(--text)",
};

const p: React.CSSProperties = {
  margin: "0 0 16px",
  color: "var(--text)",
};

const ul: React.CSSProperties = {
  margin: "0 0 16px",
  paddingLeft: "24px",
  color: "var(--text)",
};

/**
 * Public Privacy Policy page. Substance derived from
 * docs/legal/PRIVACY-POLICY.md, presented as a clean page (no draft warnings
 * or TODO placeholders). Lives outside the (app) auth group so it is
 * unauthenticated and crawlable — this is the URL Facebook's app review and
 * data-handling disclosures point to.
 */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate={EFFECTIVE_DATE}
      lastUpdated={LAST_UPDATED}
    >
      <p style={p}>
        This Privacy Policy explains how Project 50 (&ldquo;<strong>we</strong>
        &rdquo;, &ldquo;<strong>us</strong>&rdquo;, &ldquo;<strong>our</strong>
        &rdquo;) collects, uses, and shares personal data when you use the
        Project 50 website, mobile apps, and related services (the &ldquo;
        <strong>Service</strong>&rdquo;).
      </p>

      <h2 style={h2}>1. Data we collect</h2>

      <h3 style={h3}>Account &amp; profile data</h3>
      <p style={p}>
        When you sign in with Google or Facebook, we create a profile that
        contains:
      </p>
      <ul style={ul}>
        <li>
          <strong>Handle</strong> — a unique username (3–30 characters),
          initially derived from your identity provider and editable by you.
        </li>
        <li>
          <strong>Display name</strong> — initially taken from your identity
          provider; you can change it.
        </li>
        <li>
          <strong>Avatar image URL</strong> (optional) — the profile-image URL
          provided by your identity provider, if any.
        </li>
        <li>
          <strong>Identity link</strong> — the provider (Google or Facebook)
          plus the provider-specific account identifier, so we can recognise you
          on return visits.
        </li>
      </ul>
      <p style={p}>
        The email address from your identity provider is used transiently at
        sign-in (for example, to help derive an initial handle) and is not
        persisted in our database.
      </p>

      <h3 style={h3}>Challenge &amp; activity data</h3>
      <ul style={ul}>
        <li>
          <strong>Challenges</strong> you create: title, goal type, unit, daily
          target, start date, timezone, length, program kind, status, and
          visibility setting (Public / Followers / Private).
        </li>
        <li>
          <strong>Activity logs</strong> and progress: per-day entries, amounts,
          completion status, optional notes, and an optional mood value.
        </li>
        <li>
          <strong>Daily statuses, milestones, rule checks, and recaps</strong>{" "}
          computed from your activity.
        </li>
      </ul>

      <h3 style={h3}>Photos &amp; media</h3>
      <p style={p}>
        Photos and other media you upload with your activity logs, and generated
        recap media. These files are stored in our object storage; we also store
        image dimensions and ordering.
      </p>

      <h3 style={h3}>Social graph &amp; interactions</h3>
      <ul style={ul}>
        <li>
          <strong>Follows</strong> — who you follow and who follows you.
        </li>
        <li>
          <strong>Reactions and comments</strong> (cheers and comment text) you
          make on activities.
        </li>
        <li>
          <strong>Blocks</strong> — users you have blocked.
        </li>
        <li>
          <strong>Reports</strong> — content or users you report, used for
          safety and moderation.
        </li>
      </ul>

      <h3 style={h3}>Technical &amp; log data</h3>
      <p style={p}>
        Strictly necessary session and authentication cookies (see Cookies &amp;
        sessions below), plus limited error and diagnostic data when error
        monitoring is enabled, used to keep the Service secure and to fix
        problems.
      </p>

      <h2 style={h2}>2. How we use your data</h2>
      <ul style={ul}>
        <li>To create and operate your account.</li>
        <li>To provide challenges, tracking, and recaps.</li>
        <li>
          To power social features (follows, public profiles, reactions)
          according to your visibility settings.
        </li>
        <li>For safety, moderation, and abuse prevention.</li>
        <li>For security, fraud prevention, and rate limiting.</li>
        <li>For debugging and reliability.</li>
        <li>To communicate with you about the Service.</li>
      </ul>
      <p style={p}>We do not sell your personal data.</p>

      <h2 style={h2}>3. How we share data</h2>
      <p style={p}>
        We share personal data only with service providers that help us run the
        Service, and as required by law:
      </p>
      <ul style={ul}>
        <li>
          <strong>Google</strong> and <strong>Facebook (Meta)</strong> — OAuth
          sign-in.
        </li>
        <li>
          <strong>Object-storage provider</strong> — stores uploaded photos and
          recap media.
        </li>
        <li>
          <strong>Hosting / application provider</strong> — runs the app and
          database.
        </li>
        <li>
          <strong>Error monitoring</strong> — receives diagnostic data when
          enabled, to help us fix problems.
        </li>
      </ul>

      <h2 style={h2}>4. Data retention</h2>
      <p style={p}>
        We retain personal data for as long as your account is active and as
        needed to provide the Service. When you delete your account, we
        permanently delete your profile and associated data — including identity
        links, challenges, activities, uploaded media, day statuses, milestones,
        recaps, rule checks, follows (in both directions), and reactions — via
        cascading deletion. See{" "}
        <Link href="/data-deletion" style={{ color: "var(--accent)" }}>
          how to delete your data
        </Link>
        .
      </p>

      <h2 style={h2}>5. Cookies &amp; sessions</h2>
      <p style={p}>
        The Service uses a small number of strictly necessary cookies to keep
        you signed in and to secure your session. Authentication uses a JWT-based
        session cookie with a maximum lifetime of about 30 days, refreshed
        periodically while you are active. On secure (HTTPS) deployments the
        session cookie is marked Secure. We do not use advertising or third-party
        analytics cookies.
      </p>

      <h2 style={h2}>6. Your rights &amp; choices</h2>
      <p style={p}>
        Depending on where you live, you may have rights to access, correct,
        delete, export, restrict, or object to the processing of your personal
        data, and to withdraw consent where processing relies on it.
      </p>
      <ul style={ul}>
        <li>
          <strong>Edit your profile</strong> (handle, display name) in Settings.
        </li>
        <li>
          <strong>Control visibility</strong> of each challenge (Public /
          Followers / Private).
        </li>
        <li>
          <strong>Delete your account</strong> at any time in{" "}
          <strong>Settings → Delete Account</strong>. This permanently and
          irreversibly removes your data.
        </li>
        <li>
          <strong>Exercise other rights</strong> by contacting us at{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "var(--accent)" }}>
            {PRIVACY_EMAIL}
          </a>
          .
        </li>
      </ul>

      <h2 style={h2}>7. Security</h2>
      <p style={p}>
        We use technical and organizational measures to protect personal data,
        including authentication, transport security (HTTPS), content-security
        policies, rate limiting, and upload validation. No method of transmission
        or storage is completely secure.
      </p>

      <h2 style={h2}>8. Children</h2>
      <p style={p}>
        The Service is not directed to children under 13 (or the higher minimum
        age in your jurisdiction). We do not knowingly collect personal data from
        children below that age. If you believe a child has provided us personal
        data, contact us and we will delete it.
      </p>

      <h2 style={h2}>9. Changes to this Policy</h2>
      <p style={p}>
        We may update this Policy from time to time. Material changes will be
        communicated by reasonable means, such as an in-app notice or by updating
        the &ldquo;Last updated&rdquo; date above.
      </p>

      <h2 style={h2}>10. Contact</h2>
      <p style={p}>
        Privacy questions or rights requests:{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "var(--accent)" }}>
          {PRIVACY_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}
