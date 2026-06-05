import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — Project 50",
  description:
    "The terms that govern your access to and use of the Project 50 service.",
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
 * Public Terms of Service page. Substance derived from
 * docs/legal/TERMS-OF-SERVICE.md, presented as a clean page (no draft warnings
 * or TODO placeholders). Lives outside the (app) auth group so it is
 * unauthenticated and crawlable.
 */
export default function TermsOfServicePage() {
  return (
    <LegalPage
      title="Terms of Service"
      effectiveDate={EFFECTIVE_DATE}
      lastUpdated={LAST_UPDATED}
    >
      <p style={p}>
        These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your
        access to and use of the Project 50 website, mobile applications, and
        related services (collectively, the &ldquo;<strong>Service</strong>
        &rdquo;) provided by Project 50 (&ldquo;<strong>we</strong>&rdquo;,
        &ldquo;<strong>us</strong>&rdquo;, &ldquo;<strong>our</strong>&rdquo;). By
        creating an account or otherwise using the Service, you agree to these
        Terms. If you do not agree, do not use the Service.
      </p>

      <h2 style={h2}>1. Eligibility &amp; accounts</h2>
      <p style={p}>
        You must be at least 13 years old (or the higher minimum
        digital-consent age in your jurisdiction) to use the Service. You create
        an account by signing in with a supported third-party identity provider
        (currently Google or Facebook). We create a profile for you that includes
        a unique handle, a display name, and an optional avatar image. You are
        responsible for activity under your account and for keeping the
        third-party account you use to sign in secure. Provide accurate
        information and do not impersonate any person or misrepresent your
        affiliation with anyone.
      </p>

      <h2 style={h2}>2. The Project 50 program</h2>
      <p style={p}>
        Project 50 is a self-directed program in which you commit to a set of
        daily rules over a 50-day period, with an all-or-nothing hard reset if
        you miss a day. The Service also lets you create custom challenges with
        your own goals, units, and durations.
      </p>
      <p style={p}>
        <strong>No guarantees; not professional advice.</strong> The Service is a
        motivational and habit-tracking tool only. We do not guarantee any
        particular result, including any health, fitness, wellness, financial, or
        personal outcome. The Service is not medical, psychological, nutritional,
        fitness, financial, or other professional advice and is not a substitute
        for advice from a qualified professional. Consult a qualified
        professional (for example, a physician) before beginning any new
        physical, dietary, or other strenuous activity. You participate at your
        own risk.
      </p>

      <h2 style={h2}>3. User content &amp; license</h2>
      <p style={p}>
        &ldquo;<strong>User Content</strong>&rdquo; means anything you submit to
        the Service, including challenge titles, activity logs, notes, mood
        entries, photos and other media you upload, reactions, and comments. You
        retain ownership of your User Content.
      </p>
      <p style={p}>
        You grant us a worldwide, non-exclusive, royalty-free, sublicensable
        license to host, store, reproduce, modify (for example, resize or
        transcode images), display, and distribute your User Content solely to
        operate, provide, secure, and improve the Service and as directed by your
        visibility settings (Public, Followers, or Private). This license ends
        when you delete the relevant content or your account, except for content
        others have re-shared within the limits the Service allows, and to the
        extent retention is required by law or for backups.
      </p>
      <p style={p}>
        Content you mark Public (or share via a share link) can be viewed by
        others, including people who are not logged in. You are responsible for
        choosing the appropriate visibility for your content, and you represent
        that you have the rights necessary to submit it.
      </p>

      <h2 style={h2}>4. Acceptable use</h2>
      <p style={p}>You agree not to, and not to attempt to:</p>
      <ul style={ul}>
        <li>
          post content that is illegal, infringing, defamatory, harassing,
          hateful, sexually exploitative, or that depicts or promotes violence or
          self-harm;
        </li>
        <li>
          upload media you do not have the right to share, or that contains
          another person&rsquo;s private information without their consent;
        </li>
        <li>harass, bully, threaten, stalk, or impersonate others;</li>
        <li>
          spam, post misleading content, or manipulate metrics such as reactions
          or follows;
        </li>
        <li>
          access accounts, data, or systems without authorization, probe or test
          the vulnerability of the Service, or circumvent rate limits,
          authentication, or other protective measures;
        </li>
        <li>scrape or harvest data except as expressly permitted;</li>
        <li>
          introduce malware or interfere with the integrity or performance of
          the Service.
        </li>
      </ul>
      <p style={p}>
        The Service provides tools to block and report other users and content.
        We may review reported content and, at our discretion, remove content,
        limit features, or suspend or terminate accounts that violate these
        Terms.
      </p>

      <h2 style={h2}>5. Third-party services</h2>
      <p style={p}>
        The Service relies on third parties to function — including your sign-in
        provider (Google or Facebook), our hosting and object-storage providers,
        and, where enabled, error monitoring. Your use of those providers may be
        subject to their own terms and policies. See our{" "}
        <Link href="/privacy" style={{ color: "var(--accent)" }}>
          Privacy Policy
        </Link>{" "}
        for details.
      </p>

      <h2 style={h2}>6. Intellectual property</h2>
      <p style={p}>
        Except for User Content, the Service and all associated software,
        designs, text, and trademarks are owned by us or our licensors and are
        protected by intellectual-property laws. We grant you a limited,
        revocable, non-transferable, non-exclusive license to use the Service for
        your personal, non-commercial use in accordance with these Terms.
      </p>

      <h2 style={h2}>7. Termination</h2>
      <p style={p}>
        You may stop using the Service at any time and may permanently delete
        your account from in-app Settings (see{" "}
        <Link href="/data-deletion" style={{ color: "var(--accent)" }}>
          how to delete your data
        </Link>
        ). We may suspend or terminate your access if you violate these Terms, if
        required by law, or to protect the Service or other users. Sections that
        by their nature should survive termination — including disclaimers,
        limitations of liability, and dispute terms — survive.
      </p>

      <h2 style={h2}>8. Disclaimers</h2>
      <p style={p}>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
        AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
        IMPLIED, OR STATUTORY, INCLUDING ANY IMPLIED WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT,
        AND ANY WARRANTY THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR
        ERROR-FREE. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN
        WARRANTIES, SO SOME OF THE ABOVE MAY NOT APPLY TO YOU.
      </p>

      <h2 style={h2}>9. Limitation of liability</h2>
      <p style={p}>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR SUPPLIERS WILL NOT BE
        LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
        DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, OR GOODWILL, OR FOR ANY
        PERSONAL INJURY ARISING FROM ACTIVITIES YOU CHOOSE TO UNDERTAKE, ARISING
        OUT OF OR RELATING TO THE SERVICE. NOTHING IN THESE TERMS LIMITS
        LIABILITY THAT CANNOT BE LIMITED BY LAW.
      </p>

      <h2 style={h2}>10. Changes to these Terms</h2>
      <p style={p}>
        We may update these Terms from time to time. If we make material changes,
        we will provide reasonable notice, such as an in-app notice or by
        updating the &ldquo;Last updated&rdquo; date above. Your continued use of
        the Service after changes take effect constitutes acceptance.
      </p>

      <h2 style={h2}>11. Contact</h2>
      <p style={p}>
        Questions about these Terms:{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "var(--accent)" }}>
          {PRIVACY_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}
