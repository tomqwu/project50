import Link from "next/link";
import { Button, Label } from "@project50/ui";
import { PROJECT50_RULES, PROJECT50_LENGTH_DAYS } from "@project50/core";

/**
 * First-run explainer for Project 50. Purely presentational so it can be
 * rendered both by the /welcome server page and in isolation by tests.
 * Styling mirrors the Project 50 "NONE" start screen for visual consistency.
 */
export function WelcomeExplainer() {
  return (
    <div style={{ padding: "48px 32px", textAlign: "center", maxWidth: 480, marginInline: "auto" }}>
      <Label>Welcome</Label>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: "28px",
          margin: "12px 0",
        }}
      >
        Project 50
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "8px" }}>
        A {PROJECT50_LENGTH_DAYS}-day hard reset. {PROJECT50_RULES.length} daily rules, every single
        day. No days off.
      </p>

      <h2
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: "18px",
          margin: "28px 0 8px",
        }}
      >
        How it works
      </h2>
      <p style={{ color: "var(--muted)", margin: "0 0 12px" }}>
        Each day you complete all {PROJECT50_RULES.length} rules:
      </p>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 28px",
          textAlign: "left",
        }}
      >
        {PROJECT50_RULES.map((r) => (
          <li
            key={r.id}
            style={{
              color: "var(--text)",
              padding: "8px 0",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <strong>{r.title}</strong>{" "}
            <span style={{ color: "var(--muted)", fontSize: 13 }}>· {r.detail}</span>
          </li>
        ))}
      </ul>

      <h2
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: "18px",
          margin: "0 0 8px",
        }}
      >
        All or nothing
      </h2>
      <p
        data-testid="welcome-all-or-nothing"
        style={{ color: "var(--muted)", margin: "0 0 28px" }}
      >
        Project 50 is all-or-nothing. Finish all {PROJECT50_RULES.length} rules for{" "}
        {PROJECT50_LENGTH_DAYS} days straight and you win. Miss a single rule on any day and the
        streak resets — you start over from Day 1.
      </p>

      <Link href="/" data-testid="welcome-cta" style={{ textDecoration: "none" }}>
        <Button variant="primary">Start Project 50</Button>
      </Link>
    </div>
  );
}
