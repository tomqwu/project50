"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Label } from "@project50/ui";
import { PROJECT50_RULES, PROJECT50_LENGTH_DAYS } from "@project50/core";
import type { Project50State } from "@/lib/project50";
import { Project50Calendar } from "./Project50Calendar";

interface Props {
  state: Project50State;
  onStart: () => void;
  onToggle: (ruleId: number, done: boolean) => void;
  onRestart: () => void;
}

// Extra guidance surfaced in the per-rule help panel, keyed by rule id.
// The rule `detail` from @project50/core is always shown; this just adds a tip.
const RULE_HELP_TIPS: Record<number, string> = {
  1: "A consistent wake time anchors the whole day. Aim for the same time daily, even on weekends.",
  2: "Spend the first hour intentionally — stretch, plan, or meditate. Keep your phone away.",
  3: "Any movement counts: a walk, a run, the gym. The goal is a full hour, every day.",
  4: "Nonfiction keeps you learning. Ten pages is the floor, not the ceiling.",
  5: "Deliberate practice on one skill compounds fast. Block the hour and protect it.",
  6: "Hydration and clean eating fuel everything else. Small, repeatable choices win.",
  7: "Reflection turns days into progress. Note one win and one lesson before bed.",
};

export function Project50View({ state, onStart, onToggle, onRestart }: Props) {
  const [openHelpId, setOpenHelpId] = useState<number | null>(null);

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

  if (state.status === "COMPLETED") {
    return (
      <div style={{ padding: "48px 32px", textAlign: "center" }}>
        <Label>Project 50</Label>
        <div aria-hidden={true} style={{ fontSize: 56, margin: "8px 0 4px" }}>🏆</div>
        <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "28px", margin: "8px 0" }}>
          You finished Project 50!
        </h1>
        <p style={{ color: "var(--text)", fontSize: 18, margin: "0 0 4px" }}>
          <strong>{state.completedDays ?? 50} days</strong>, all 7 rules, every single day.
        </p>
        <p style={{ color: "var(--muted)", margin: "0 0 28px" }}>
          A hard reset, completed. What you build next is up to you.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320, marginInline: "auto" }}>
          <Button variant="primary" onClick={onRestart}>Run it again</Button>
          <Link href="/challenges/new" style={{ textDecoration: "none" }}>
            <Button variant="ghost">Create a custom plan</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ACTIVE
  const today = state.today!;
  const dayComplete = today.completedCount === PROJECT50_RULES.length;
  const daysLeft = PROJECT50_LENGTH_DAYS - today.dayNumber;
  const remaining = PROJECT50_RULES.length - today.completedCount;
  const nextStep =
    daysLeft <= 0
      ? "That was your final day. Your run completes once today rolls over — check back to see Project 50 finished."
      : `Nothing more to do today. Come back tomorrow for Day ${today.dayNumber + 1} of ${PROJECT50_LENGTH_DAYS} — ${daysLeft} ${daysLeft === 1 ? "day" : "days"} to go.`;
  return (
    <div style={{ padding: "32px" }}>
      <Label>Project 50</Label>
      <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "28px", margin: "8px 0 4px" }}>
        Day {today.dayNumber} / 50
      </h1>
      {dayComplete ? (
        <div
          data-testid="day-complete-banner"
          role="status"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background: "rgba(214,255,63,0.10)",
            border: "1px solid var(--accent)",
            borderRadius: 12,
            padding: "14px 16px",
            margin: "8px 0 24px",
          }}
        >
          <strong style={{ color: "var(--accent)", fontSize: 15 }}>
            ✓ Day {today.dayNumber} complete — 7 / 7, locked in
          </strong>
          <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
            {daysLeft <= 0 ? "Final day done. " : ""}
            {nextStep}
          </span>
        </div>
      ) : (
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>
          {today.completedCount} / 7 today · {remaining} to go · miss one and you restart at Day 1
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PROJECT50_RULES.map((r) => {
          const done = today.checks[r.id - 1] ?? false;
          const helpOpen = openHelpId === r.id;
          return (
            <Card key={r.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  data-testid={`rule-row-${r.id}`}
                  onClick={() => onToggle(r.id, !done)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0,
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
                <button
                  type="button"
                  data-testid={`rule-help-${r.id}`}
                  aria-expanded={helpOpen}
                  aria-label={`Help for ${r.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHelpId((cur) => (cur === r.id ? null : r.id));
                  }}
                  style={{
                    flexShrink: 0, width: 28, height: 28, marginRight: 12, borderRadius: "50%",
                    border: "1px solid var(--hairline)", background: "transparent",
                    color: "var(--muted)", cursor: "pointer", fontSize: 14, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ?
                </button>
              </div>
              {helpOpen && (
                <div
                  data-testid={`rule-help-panel-${r.id}`}
                  style={{
                    padding: "0 16px 16px", color: "var(--muted)", fontSize: 13,
                    borderTop: "1px solid var(--hairline)", marginTop: 0, paddingTop: 12,
                  }}
                >
                  <p style={{ margin: 0, color: "var(--text)" }}>{r.detail}</p>
                  <p style={{ margin: "8px 0 0" }}>{RULE_HELP_TIPS[r.id]}</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <Project50Calendar days={state.history?.days ?? []} />
    </div>
  );
}
