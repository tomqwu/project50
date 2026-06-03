"use client";

import Link from "next/link";
import { Button, Card, Label } from "@project50/ui";
import { PROJECT50_RULES } from "@project50/core";
import type { Project50State } from "@/lib/project50";

interface Props {
  state: Project50State;
  onStart: () => void;
  onToggle: (ruleId: number, done: boolean) => void;
  onRestart: () => void;
}

export function Project50View({ state, onStart, onToggle, onRestart }: Props) {
  if (state.status === "NONE") {
    return (
      <div style={{ padding: "48px 32px", textAlign: "center" }}>
        <Label>Choose your plan</Label>
        <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "28px", margin: "12px 0" }}>
          Project 50
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "8px" }}>
          7 daily rules. 50 days. Miss one — back to Day 1.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 28px", textAlign: "left", maxWidth: 320, marginInline: "auto" }}>
          {PROJECT50_RULES.map((r) => (
            <li key={r.id} style={{ color: "var(--text)", padding: "6px 0", borderBottom: "1px solid var(--hairline)" }}>
              <strong>{r.title}</strong>{" "}
              <span style={{ color: "var(--muted)", fontSize: 13 }}>· {r.detail}</span>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Button variant="primary" onClick={onStart}>Start Project 50</Button>
          <Link href="/challenges/new" style={{ textDecoration: "none" }}>
            <Button variant="ghost">Create a custom plan</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === "FAILED") {
    const rule = PROJECT50_RULES.find((r) => r.id === state.failedRuleId);
    return (
      <div style={{ padding: "48px 32px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "26px" }}>
          Streak broken
        </h1>
        <p style={{ color: "var(--muted)", margin: "12px 0 28px" }}>
          You missed <strong>{rule?.title ?? "a rule"}</strong> on Day {state.failedDayNumber}. Project 50 is all-or-nothing — restart from Day 1?
        </p>
        <Button variant="primary" onClick={onRestart}>Start over</Button>
      </div>
    );
  }

  // ACTIVE
  const today = state.today!;
  return (
    <div style={{ padding: "32px" }}>
      <Label>Project 50</Label>
      <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "28px", margin: "8px 0 4px" }}>
        Day {today.dayNumber} / 50
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        {today.completedCount} / 7 today · miss one and you restart at Day 1
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PROJECT50_RULES.map((r) => {
          const done = today.checks[r.id - 1] ?? false;
          return (
            <Card key={r.id}>
              <button
                type="button"
                data-testid={`rule-row-${r.id}`}
                onClick={() => onToggle(r.id, !done)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, width: "100%",
                  padding: "16px", background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left", color: "var(--text)",
                }}
              >
                <span aria-hidden={true} style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  border: "2px solid var(--accent)",
                  background: done ? "var(--accent)" : "transparent",
                  color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700,
                }}>{done ? "✓" : ""}</span>
                <span>
                  <strong>{r.title}</strong>
                  <br />
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>{r.detail}</span>
                </span>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
