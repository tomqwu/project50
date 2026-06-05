"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Label } from "@project50/ui";
import type { LeaderboardEntry, LeaderboardScope } from "@/lib/leaderboard";

export interface LeaderboardProps {
  friends: LeaderboardEntry[];
  global: LeaderboardEntry[];
}

const TABS: { scope: LeaderboardScope; label: string }[] = [
  { scope: "friends", label: "Friends" },
  { scope: "global", label: "Global" },
];

/**
 * Dashboard leaderboard: a tabbed (Friends | Global) ranked table of Project 50
 * runners by current day (tie-break: total completed days). The viewer's own
 * row is highlighted. The Friends tab shows an invite empty-state when the user
 * follows no one — its link is the F4 invite *seam* (a plain placeholder; F4
 * will later wire the real invite button here).
 */
export function Leaderboard({ friends, global }: LeaderboardProps) {
  const [scope, setScope] = useState<LeaderboardScope>("friends");
  const rows = scope === "friends" ? friends : global;

  return (
    <section
      aria-label="Project 50 leaderboard"
      style={{ marginTop: "40px" }}
    >
      <Label>Leaderboard</Label>

      <div
        role="tablist"
        aria-label="Leaderboard scope"
        style={{ display: "flex", gap: "8px", margin: "12px 0 16px" }}
      >
        {TABS.map((t) => {
          const selected = scope === t.scope;
          return (
            <button
              key={t.scope}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setScope(t.scope)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid var(--hairline)",
                background: selected ? "var(--accent, #111)" : "transparent",
                color: selected ? "var(--accent-contrast, #fff)" : "var(--text)",
                fontFamily: "var(--font-body, system-ui)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState scope={scope} />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "var(--font-body, system-ui)",
            }}
          >
            <thead>
              <tr>
                <th scope="col" style={thStyle}>Rank</th>
                <th scope="col" style={thStyle}>Runner</th>
                <th scope="col" style={{ ...thStyle, textAlign: "right" }}>
                  Progress
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.userId} entry={r} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <tr
      data-testid={`leaderboard-row-${entry.userId}`}
      aria-current={entry.isMe ? "true" : undefined}
      style={{
        borderTop: "1px solid var(--hairline)",
        background: entry.isMe ? "var(--accent-soft, rgba(0,0,0,0.05))" : "transparent",
      }}
    >
      <td style={{ ...tdStyle, fontWeight: 700, width: "44px" }}>{entry.rank}</td>
      <td style={tdStyle}>
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Avatar entry={entry} />
          <span style={{ color: "var(--text)", fontWeight: entry.isMe ? 700 : 500 }}>
            {entry.displayName}
          </span>
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <span style={{ display: "block", color: "var(--text)", fontWeight: 600 }}>
          Day {entry.currentDay}
        </span>
        <span style={{ display: "block", color: "var(--muted)", fontSize: "12px" }}>
          {entry.completedDays} days total
        </span>
      </td>
    </tr>
  );
}

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  const size = 32;
  if (entry.avatarUrl) {
    return (
      <img
        src={entry.avatarUrl}
        alt={entry.displayName}
        width={size}
        height={size}
        style={{ borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }
  const initial = entry.displayName.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: "var(--hairline)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: "var(--text)",
      }}
    >
      {initial}
    </span>
  );
}

function EmptyState({ scope }: { scope: LeaderboardScope }) {
  if (scope === "friends") {
    return (
      <Card>
        <div
          data-testid="leaderboard-empty-friends"
          style={{ padding: "24px", textAlign: "center" }}
        >
          <p style={{ color: "var(--muted)", marginBottom: "16px" }}>
            No friends yet — invite some to race the program together.
          </p>
          {/*
            F4 INVITE SEAM: placeholder link to the referral page. Feature F4
            will replace this with the real invite button/flow. Intentionally
            does NOT import F4 code.
          */}
          <Link
            href="/refer"
            data-testid="leaderboard-invite-seam"
            style={{
              display: "inline-block",
              padding: "10px 16px",
              borderRadius: "12px",
              border: "1px solid var(--hairline)",
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Invite friends
          </Link>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div
        data-testid="leaderboard-empty-global"
        style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}
      >
        No one has started Project 50 yet. Be the first.
      </div>
    </Card>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--muted)",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "15px",
  verticalAlign: "middle",
};
