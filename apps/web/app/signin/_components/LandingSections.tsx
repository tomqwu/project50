import type { CSSProperties } from "react";

/**
 * Presentational building blocks for the public marketing landing.
 * Kept separate from Landing.tsx so each block stays small, testable, and
 * easy to recompose. All styling uses Momentum CSS variables + inline styles
 * to match the rest of the app. No client-side state — pure presentation.
 */

const sectionLabelStyle: CSSProperties = {
  fontFamily: "var(--font-body, system-ui, sans-serif)",
  fontSize: "12px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--accent)",
  fontWeight: 700,
  margin: "0 0 8px",
};

const sectionTitleStyle: CSSProperties = {
  fontFamily: "var(--font-display, 'Anton', sans-serif)",
  fontSize: "clamp(26px, 6vw, 34px)",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: "var(--text)",
  lineHeight: 1.05,
  margin: "0 0 24px",
};

export interface Step {
  n: string;
  title: string;
  body: string;
}

export const HOW_IT_WORKS_STEPS: readonly Step[] = [
  {
    n: "01",
    title: "Commit to all 7 rules",
    body: "Wake early, train, read, learn, eat clean, do your morning routine, and journal — every single day.",
  },
  {
    n: "02",
    title: "Log the day, no excuses",
    body: "Check off all 7 rules and snap a progress photo. Miss even one rule and the streak resets to Day 1.",
  },
  {
    n: "03",
    title: "Finish 50 days, become someone new",
    body: "String together 50 perfect days and your discipline compounds into a genuine hard reset.",
  },
] as const;

export interface Benefit {
  title: string;
  body: string;
}

export const BENEFITS: readonly Benefit[] = [
  {
    title: "Streaks that actually mean something",
    body: "All-or-nothing scoring makes every day count. Your streak is proof you showed up completely, not partially.",
  },
  {
    title: "Daily photo log",
    body: "Attach a photo to each day so your transformation is visible — look back at Day 1 versus Day 50.",
  },
  {
    title: "The reset, not just a tracker",
    body: "Seven research-backed rules built to overhaul your mornings, body, mind, and habits in one run.",
  },
  {
    title: "Shareable 50-day recap",
    body: "Cross the finish line and generate a recap video and cards to share the win you earned.",
  },
] as const;

export function HowItWorksStrip() {
  return (
    <section
      data-testid="landing-how-it-works-strip"
      style={{
        width: "100%",
        maxWidth: "880px",
        margin: "0 0 64px",
        textAlign: "center",
      }}
    >
      <p style={sectionLabelStyle}>The program</p>
      <h2 style={sectionTitleStyle}>How it works</h2>
      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          textAlign: "left",
        }}
      >
        {HOW_IT_WORKS_STEPS.map((step) => (
          <li
            key={step.n}
            data-testid="landing-step"
            style={{
              background: "var(--card)",
              border: "1px solid var(--hairline)",
              borderRadius: "18px",
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display, 'Anton', sans-serif)",
                fontSize: "34px",
                lineHeight: 1,
                color: "var(--accent)",
              }}
            >
              {step.n}
            </span>
            <span
              style={{
                fontFamily: "var(--font-body, system-ui, sans-serif)",
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              {step.title}
            </span>
            <span
              style={{
                fontFamily: "var(--font-body, system-ui, sans-serif)",
                fontSize: "14px",
                lineHeight: 1.55,
                color: "var(--muted)",
              }}
            >
              {step.body}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function BenefitsGrid() {
  return (
    <section
      data-testid="landing-benefits"
      style={{
        width: "100%",
        maxWidth: "880px",
        margin: "0 0 64px",
        textAlign: "center",
      }}
    >
      <p style={sectionLabelStyle}>Why it works</p>
      <h2 style={sectionTitleStyle}>Built to make the 50 days stick</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
          textAlign: "left",
        }}
      >
        {BENEFITS.map((benefit) => (
          <article
            key={benefit.title}
            data-testid="landing-benefit"
            style={{
              background: "var(--card)",
              border: "1px solid var(--hairline)",
              borderRadius: "18px",
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <h3
              style={{
                fontFamily: "var(--font-body, system-ui, sans-serif)",
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              {benefit.title}
            </h3>
            <p
              style={{
                fontFamily: "var(--font-body, system-ui, sans-serif)",
                fontSize: "14px",
                lineHeight: 1.55,
                color: "var(--muted)",
                margin: 0,
              }}
            >
              {benefit.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
