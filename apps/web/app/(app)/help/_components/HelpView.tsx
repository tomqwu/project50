import { PROJECT50_RULES, PROJECT50_LENGTH_DAYS } from "@project50/core";
import type { ReactNode } from "react";

/**
 * Address Project 50 support emails land on. Exported so the page, tests, and
 * any future contact form share a single source of truth.
 */
export const SUPPORT_EMAIL = "support@project50.app";

interface Faq {
  q: string;
  a: ReactNode;
}

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display, 'Anton', sans-serif)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  fontSize: "18px",
  margin: "32px 0 12px",
};

const questionStyle: React.CSSProperties = {
  fontFamily: "var(--font-body, system-ui)",
  fontWeight: 600,
  fontSize: "16px",
  cursor: "pointer",
  listStyle: "none",
  padding: "14px 0",
};

const answerStyle: React.CSSProperties = {
  color: "var(--muted)",
  fontFamily: "var(--font-body, system-ui)",
  fontSize: "15px",
  lineHeight: 1.55,
  margin: "0 0 14px",
};

const FAQS: readonly { heading: string; items: readonly Faq[] }[] = [
  {
    heading: "The program",
    items: [
      {
        q: "How do the 7 rules work?",
        a: (
          <>
            <p style={answerStyle}>
              Every day of Project 50 you complete the same {PROJECT50_RULES.length} daily rules.
              They&rsquo;re fixed, non-negotiable, and the same for everyone on the standard program:
            </p>
            <ul style={{ ...answerStyle, paddingLeft: 18 }}>
              {PROJECT50_RULES.map((r) => (
                <li key={r.id}>
                  <strong style={{ color: "var(--text)" }}>{r.title}</strong> — {r.detail}
                </li>
              ))}
            </ul>
          </>
        ),
      },
      {
        q: "What counts as a miss?",
        a: (
          <p style={answerStyle}>
            A miss is any day where you don&rsquo;t complete all {PROJECT50_RULES.length} rules.
            There are no partial days, no makeups, and no days off — every one of the{" "}
            {PROJECT50_LENGTH_DAYS} days requires all {PROJECT50_RULES.length} rules.
          </p>
        ),
      },
      {
        q: "What is a hard reset?",
        a: (
          <p style={answerStyle}>
            Project 50 is all-or-nothing: miss a single rule on a single day and the streak triggers
            a hard reset — your progress goes back to zero and you start over from Day 1. The reset
            is the whole point of the program.
          </p>
        ),
      },
    ],
  },
  {
    heading: "Getting started",
    items: [
      {
        q: "How do I start Project 50?",
        a: (
          <p style={answerStyle}>
            Head to your dashboard and start the program. Day 1 begins the moment you commit — from
            then on you check off all {PROJECT50_RULES.length} rules each day to keep the streak
            alive for {PROJECT50_LENGTH_DAYS} days straight.
          </p>
        ),
      },
      {
        q: "How do I restart after a miss?",
        a: (
          <p style={answerStyle}>
            After a hard reset you don&rsquo;t need to do anything special: just complete all{" "}
            {PROJECT50_RULES.length} rules again to begin a fresh Day 1. The reset is the
            point of the program — restarting is how you build the discipline.
          </p>
        ),
      },
      {
        q: "Can I use a custom plan instead?",
        a: (
          <p style={answerStyle}>
            Yes. If the standard 7 rules don&rsquo;t fit your life, you can create a custom plan with
            your own rules while keeping the same {PROJECT50_LENGTH_DAYS}-day, all-or-nothing
            structure. The hard-reset mechanic still applies — that&rsquo;s what makes it Project 50.
          </p>
        ),
      },
    ],
  },
  {
    heading: "Privacy & your account",
    items: [
      {
        q: "What about my privacy?",
        a: (
          <p style={answerStyle}>
            Your daily check-ins and journal are yours. You control what you share to the public
            feed — anything you don&rsquo;t post stays private to your account. We only collect what
            we need to run the program and never sell your data.
          </p>
        ),
      },
      {
        q: "How do I delete my account?",
        a: (
          <p style={answerStyle}>
            Open Settings and use the &ldquo;Delete account&rdquo; section in the danger zone. After
            you confirm with your handle, your account and all of your Project 50 data are
            permanently removed. This can&rsquo;t be undone.
          </p>
        ),
      },
    ],
  },
];

/**
 * Help Center for Project 50: program FAQs plus an in-app way to reach support.
 * Purely presentational so it renders identically from the /help server page and
 * in isolation under test. Styling mirrors the Momentum app shell.
 */
export function HelpView() {
  return (
    <div style={{ padding: "32px", maxWidth: 560, marginInline: "auto" }}>
      <h1
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          fontSize: "28px",
          margin: "0 0 8px",
        }}
      >
        Help Center
      </h1>
      <p style={{ color: "var(--muted)", fontFamily: "var(--font-body, system-ui)", margin: 0 }}>
        Answers to the most common Project 50 questions — and a direct line to us if you&rsquo;re
        still stuck.
      </p>

      {FAQS.map((section) => (
        <section key={section.heading}>
          <h2 style={sectionTitleStyle}>{section.heading}</h2>
          {section.items.map((faq) => (
            <details
              key={faq.q}
              data-testid="faq-item"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <summary style={questionStyle}>{faq.q}</summary>
              <div style={{ paddingBottom: 6 }}>{faq.a}</div>
            </details>
          ))}
        </section>
      ))}

      <section
        style={{
          marginTop: 40,
          padding: "24px",
          borderRadius: 16,
          border: "1px solid var(--hairline)",
          background: "var(--card)",
        }}
      >
        <h2 style={{ ...sectionTitleStyle, margin: "0 0 8px" }}>Still need help?</h2>
        <p style={answerStyle}>
          Didn&rsquo;t find your answer? Reach out and a human on the Project 50 team will get back
          to you. Tell us what&rsquo;s going on and we&rsquo;ll help you get unstuck.
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{
            display: "inline-block",
            padding: "12px 20px",
            borderRadius: 12,
            background: "var(--accent)",
            color: "var(--on-accent, #000)",
            fontFamily: "var(--font-body, system-ui)",
            fontWeight: 600,
            fontSize: "15px",
            textDecoration: "none",
          }}
        >
          Email support
        </a>
        <p style={{ ...answerStyle, marginTop: 12, marginBottom: 0, fontSize: 13 }}>
          Or write to us directly at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent)" }}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </div>
  );
}
