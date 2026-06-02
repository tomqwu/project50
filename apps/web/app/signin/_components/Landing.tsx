import { Card } from "@project50/ui";
import { SignInButtons } from "../SignInButtons";

const FEATURES = [
  {
    label: "50-day challenges + streaks",
    description: "Commit to a goal, log every day, and watch your streak build.",
  },
  {
    label: "Log daily with photos",
    description: "Attach a photo to each activity so your progress is visible.",
  },
  {
    label: "Shareable recap videos and cards",
    description: "Generate a highlight reel at the end and share your win.",
  },
] as const;

interface LandingProps {
  e2eEnabled?: boolean;
}

export function Landing({ e2eEnabled = false }: LandingProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "64px 24px 80px",
        gap: "0",
      }}
    >
      {/* Hero */}
      <header
        style={{
          textAlign: "center",
          marginBottom: "56px",
          maxWidth: "480px",
          width: "100%",
        }}
      >
        <h1
          data-testid="home"
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "clamp(52px, 10vw, 80px)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--accent)",
            margin: "0 0 16px",
            lineHeight: 1,
          }}
        >
          project50
        </h1>
        <p
          data-testid="landing-value-prop"
          style={{
            fontFamily: "var(--font-body, system-ui, sans-serif)",
            fontSize: "18px",
            lineHeight: 1.5,
            color: "var(--muted)",
            margin: 0,
          }}
        >
          Run a 50-day challenge. Track it daily. Celebrate and share it.
        </p>
      </header>

      {/* Feature bullets */}
      <ul
        data-testid="landing-features"
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 48px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          width: "100%",
          maxWidth: "480px",
        }}
      >
        {FEATURES.map((f) => (
          <li key={f.label}>
            <Card as="div">
              <p
                style={{
                  fontFamily: "var(--font-body, system-ui, sans-serif)",
                  fontWeight: 700,
                  fontSize: "14px",
                  letterSpacing: "0.01em",
                  color: "var(--text)",
                  margin: "0 0 4px",
                }}
              >
                {f.label}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-body, system-ui, sans-serif)",
                  fontSize: "13px",
                  color: "var(--muted)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {f.description}
              </p>
            </Card>
          </li>
        ))}
      </ul>

      {/* Sign-in card */}
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <Card as="div">
          <p
            style={{
              fontFamily: "var(--font-body, system-ui, sans-serif)",
              fontSize: "13px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              margin: "0 0 16px",
              fontWeight: 600,
            }}
          >
            Get started
          </p>
          <SignInButtons e2eEnabled={e2eEnabled} />
        </Card>
      </div>
    </div>
  );
}
