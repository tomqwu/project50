import type { CSSProperties } from "react";
import { PROJECT50_RULES } from "@project50/core";

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

/**
 * The 7 daily rules — listed in full from the single source of truth in core.
 * Numbered 1..7 as a semantic ordered list so screen readers and SEO see the
 * real program. Detail copy uses --muted (passes 4.5:1 on --bg / --card).
 */
export function RulesShowcase() {
  return (
    <section
      data-testid="landing-rules"
      style={{
        width: "100%",
        maxWidth: "880px",
        margin: "0 0 64px",
        textAlign: "center",
      }}
    >
      <p style={sectionLabelStyle}>No exceptions</p>
      <h2 style={sectionTitleStyle}>The 7 daily rules</h2>
      <p
        style={{
          fontFamily: "var(--font-body, system-ui, sans-serif)",
          fontSize: "15px",
          lineHeight: 1.6,
          color: "var(--muted)",
          margin: "-12px auto 28px",
          maxWidth: "560px",
        }}
      >
        Hit every one of these, every day, for 50 days. Miss a single rule and the streak resets to
        Day 1.
      </p>
      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "12px",
          textAlign: "left",
          counterReset: "rule",
        }}
      >
        {PROJECT50_RULES.map((rule) => (
          <li
            key={rule.id}
            data-testid="landing-rule"
            style={{
              background: "var(--card)",
              border: "1px solid var(--hairline)",
              borderRadius: "16px",
              padding: "18px 18px",
              display: "flex",
              alignItems: "flex-start",
              gap: "14px",
            }}
          >
            <span
              aria-hidden={true}
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "2px solid var(--accent)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display, 'Anton', sans-serif)",
                fontSize: 16,
                lineHeight: 1,
                fontWeight: 700,
              }}
            >
              {rule.id}
            </span>
            <span style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  fontFamily: "var(--font-body, system-ui, sans-serif)",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0 0 0 0)",
                    whiteSpace: "nowrap",
                    border: 0,
                  }}
                >
                  Rule {rule.id}:{" "}
                </span>
                {rule.title}
              </strong>
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  fontFamily: "var(--font-body, system-ui, sans-serif)",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  color: "var(--muted)",
                }}
              >
                {rule.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Which rules are pre-checked in the static preview (purely decorative).
const PREVIEW_CHECKED = new Set<number>([1, 2, 3]);

/**
 * Inline "app preview" rendered from the real Momentum tokens — a faux Project
 * 50 checklist card mirroring Project50View. Never a screenshot, so it can
 * never go stale. Fully decorative; checkmarks are aria-hidden.
 */
export function AppPreview() {
  const checkedCount = PROJECT50_RULES.filter((r) => PREVIEW_CHECKED.has(r.id)).length;
  return (
    <div
      data-testid="landing-app-preview"
      aria-label="Preview of the Project 50 daily checklist"
      role="img"
      style={{
        width: "100%",
        maxWidth: "360px",
        background: "var(--bg)",
        border: "1px solid var(--hairline)",
        borderRadius: "24px",
        padding: "24px 20px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px var(--hairline)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-body, system-ui, sans-serif)",
          fontSize: "11px",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--accent)",
          fontWeight: 700,
          margin: "0 0 6px",
        }}
      >
        Project 50
      </p>
      <p
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          textTransform: "uppercase",
          fontSize: "26px",
          letterSpacing: "0.02em",
          color: "var(--text)",
          margin: "0 0 4px",
          lineHeight: 1,
        }}
      >
        Day 1 / 50
      </p>
      <p
        style={{
          fontFamily: "var(--font-body, system-ui, sans-serif)",
          fontSize: "12px",
          color: "var(--muted)",
          margin: "0 0 18px",
        }}
      >
        {checkedCount} / 7 today · {7 - checkedCount} to go
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PROJECT50_RULES.map((rule) => {
          const done = PREVIEW_CHECKED.has(rule.id);
          return (
            <div
              key={rule.id}
              data-testid="landing-preview-rule"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "var(--card)",
                border: "1px solid var(--hairline)",
                borderRadius: "12px",
                padding: "10px 12px",
              }}
            >
              <span
                aria-hidden={true}
                data-testid={done ? "landing-preview-rule-checked" : undefined}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  flexShrink: 0,
                  border: "2px solid var(--accent)",
                  background: done ? "var(--accent)" : "transparent",
                  color: "var(--bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {done ? "✓" : ""}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-body, system-ui, sans-serif)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {rule.title}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
