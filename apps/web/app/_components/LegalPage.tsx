import Link from "next/link";
import type { ReactNode } from "react";

/**
 * On-brand layout shell for the public, unauthenticated legal pages
 * (Privacy Policy, Terms of Service, Data Deletion).
 *
 * Uses Momentum theme tokens and a readable max-width prose column. Body copy
 * uses --text (not --muted) so small text meets the 4.5:1 contrast requirement
 * on --bg. Sets a real heading hierarchy: the page title is the single <h1>;
 * child sections supply their own <h2>/<h3>.
 */
export function LegalPage({
  title,
  lastUpdated,
  effectiveDate,
  children,
}: {
  title: string;
  lastUpdated: string;
  effectiveDate?: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        padding: "48px 24px 96px",
      }}
    >
      <article
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          fontFamily: "var(--font-body, system-ui, sans-serif)",
          fontSize: "16px",
          lineHeight: 1.7,
          color: "var(--text)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: "32px",
            color: "var(--accent)",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          ← Project 50
        </Link>

        <h1
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "40px",
            lineHeight: 1.1,
            letterSpacing: "0.01em",
            textTransform: "uppercase",
            margin: "0 0 16px",
            color: "var(--text)",
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: "0 0 32px",
            paddingBottom: "24px",
            borderBottom: "1px solid var(--hairline)",
            fontSize: "14px",
            color: "var(--text)",
          }}
        >
          {effectiveDate ? (
            <>
              <span>Effective date: {effectiveDate}</span>
              <br />
            </>
          ) : null}
          <span>Last updated: {lastUpdated}</span>
        </p>

        {children}
      </article>
    </main>
  );
}
