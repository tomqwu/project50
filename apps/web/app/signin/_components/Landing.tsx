import Link from "next/link";
import { Card } from "@project50/ui";
import { SignInButtons } from "../SignInButtons";
import { HowItWorksStrip, BenefitsGrid, RulesShowcase, AppPreview } from "./LandingSections";

interface LandingProps {
  googleEnabled?: boolean;
  facebookEnabled?: boolean;
  e2eEnabled?: boolean;
  emailEnabled?: boolean;
}

export function Landing({
  googleEnabled = false,
  facebookEnabled = false,
  e2eEnabled = false,
  emailEnabled = false,
}: LandingProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "72px 24px 88px",
        gap: "0",
      }}
    >
      {/* Hero */}
      <header
        style={{
          textAlign: "center",
          marginBottom: "72px",
          maxWidth: "680px",
          width: "100%",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-body, system-ui, sans-serif)",
            fontSize: "12px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--accent)",
            fontWeight: 700,
            margin: "0 0 16px",
          }}
        >
          7 rules · 50 days · no days off
        </p>
        <h1
          data-testid="home"
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "clamp(56px, 12vw, 96px)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--accent)",
            margin: "0 0 20px",
            lineHeight: 0.95,
          }}
        >
          project50
        </h1>
        <p
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "clamp(22px, 5vw, 30px)",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            color: "var(--text)",
            margin: "0 0 16px",
            lineHeight: 1.1,
          }}
        >
          50 days to become someone you respect
        </p>
        <p
          data-testid="landing-value-prop"
          style={{
            fontFamily: "var(--font-body, system-ui, sans-serif)",
            fontSize: "17px",
            lineHeight: 1.6,
            color: "var(--muted)",
            margin: "0 auto 28px",
            maxWidth: "520px",
          }}
        >
          Project 50 is an all-or-nothing hard reset: hit all 7 rules every day for 50 days
          straight. Miss a single rule and the streak resets to Day 1. Finish, and the discipline is
          yours to keep.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/welcome"
            data-testid="landing-hero-cta"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "15px 28px",
              borderRadius: "16px",
              background: "var(--accent)",
              color: "var(--bg)",
              fontFamily: "var(--font-body, system-ui, sans-serif)",
              fontSize: "15px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              textDecoration: "none",
              boxShadow: "0 0 24px rgba(214,255,63,0.35)",
            }}
          >
            See the rules · How it works
          </Link>
          <a
            href="#get-started"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "15px 28px",
              borderRadius: "16px",
              border: "1px solid var(--hairline)",
              background: "transparent",
              color: "var(--text)",
              fontFamily: "var(--font-body, system-ui, sans-serif)",
              fontSize: "15px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            Start now
          </a>
        </div>
      </header>
      {/* Product visual — live, themeable app preview */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          width: "100%",
          marginBottom: "72px",
        }}
      >
        <AppPreview />
      </div>

      {/* The 7 daily rules — full list from core */}
      <RulesShowcase />

      {/* How it works — 3-step strip */}
      <HowItWorksStrip />

      {/* Benefits grid */}
      <BenefitsGrid />

      {/* Sign-in card */}
      <div id="get-started" style={{ width: "100%", maxWidth: "480px", scrollMarginTop: "24px" }}>
        <Card as="div">
          <p
            style={{
              fontFamily: "var(--font-body, system-ui, sans-serif)",
              fontSize: "13px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              margin: "0 0 6px",
              fontWeight: 600,
            }}
          >
            Get started
          </p>
          <p
            style={{
              fontFamily: "var(--font-body, system-ui, sans-serif)",
              fontSize: "14px",
              color: "var(--muted)",
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            Create your free account and start Day 1 today.
          </p>
          <SignInButtons
            googleEnabled={googleEnabled}
            facebookEnabled={facebookEnabled}
            e2eEnabled={e2eEnabled}
            emailEnabled={emailEnabled}
          />
          <p
            style={{
              fontFamily: "var(--font-body, system-ui, sans-serif)",
              fontSize: "13px",
              textAlign: "center",
              margin: "16px 0 0",
            }}
          >
            <Link
              href="/welcome"
              data-testid="landing-how-it-works"
              style={{ color: "var(--muted)", textDecoration: "underline" }}
            >
              How Project 50 works
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
