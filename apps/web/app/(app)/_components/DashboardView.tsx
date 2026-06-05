import { Button, Card, StatTile, ProgressRing, Label } from "@project50/ui";
import Link from "next/link";
import { Leaderboard } from "./Leaderboard";
import type { LeaderboardEntry } from "@/lib/leaderboard";

export interface DayProgress {
  totalAmount: number;
  target: number;
  completed: boolean;
}

export interface PrimaryChallenge {
  id: string;
  title: string;
  goalType: "TARGET" | "BINARY";
  unit?: string | null;
  dayNumber: number;
  today: DayProgress | null;
  currentStreak: number;
  badges: number;
  cheering: number;
}

export interface ChallengeItem {
  id: string;
  title: string;
  goalType: "TARGET" | "BINARY";
}

export interface DashboardViewProps {
  primary: PrimaryChallenge | null;
  challenges: ChallengeItem[];
  /** Friends-scope leaderboard rows (followees ∪ self). */
  friendsLeaderboard?: LeaderboardEntry[];
  /** Global-scope leaderboard rows. */
  globalLeaderboard?: LeaderboardEntry[];
  /** Viewer's referral code, forwarded to the leaderboard's invite empty-state. */
  referralCode?: string;
}

export function DashboardView({
  primary,
  challenges,
  friendsLeaderboard = [],
  globalLeaderboard = [],
  referralCode,
}: DashboardViewProps) {
  if (!primary) {
    return (
      <div
        style={{
          padding: "64px 32px",
          maxWidth: "420px",
          margin: "0 auto",
          textAlign: "center",
          fontFamily: "var(--font-body, system-ui)",
        }}
      >
        <p style={{ color: "var(--muted)", marginBottom: "24px" }}>
          No active challenges yet.
        </p>
        <Link href="/challenges/new" style={{ textDecoration: "none" }}>
          <Button variant="primary">Start a challenge</Button>
        </Link>
      </div>
    );
  }

  // For ProgressRing: TARGET uses amount/target; BINARY uses done/1
  const ringValue =
    primary.goalType === "BINARY"
      ? primary.today?.completed
        ? 1
        : 0
      : (primary.today?.totalAmount ?? 0);
  const ringMax =
    primary.goalType === "BINARY" ? 1 : (primary.today?.target ?? 1);
  const ringLabel =
    primary.goalType === "BINARY"
      ? primary.today?.completed
        ? "Done"
        : "Not done"
      : `${ringValue} / ${ringMax} ${primary.unit ?? ""}`.trim();

  // Other challenges (not the primary one)
  const others = challenges.filter((c) => c.id !== primary.id);

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      {/* Primary challenge header */}
      <div style={{ marginBottom: "32px" }}>
        <Label>Active challenge</Label>
        <h1
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "28px",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            color: "var(--text)",
            margin: "8px 0 4px",
          }}
        >
          {primary.title}
        </h1>
        <span
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "18px",
            color: "var(--muted)",
          }}
          data-testid="day-number"
        >
          Day {primary.dayNumber} / 50
        </span>
      </div>

      {/* Progress ring */}
      <div
        style={{ display: "flex", justifyContent: "center", marginBottom: "40px" }}
      >
        <ProgressRing
          value={ringValue}
          max={ringMax}
          size={180}
          label={ringLabel}
        />
      </div>

      {/* Stat tiles */}
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            padding: "24px 16px",
          }}
        >
          <StatTile value={primary.currentStreak} label="Day streak" accent />
          <StatTile value={primary.badges} label="Badges" />
          <StatTile value={primary.cheering} label="Cheering" />
        </div>
      </Card>

      {/* Log activity CTA */}
      <div style={{ marginTop: "32px" }}>
        <Link href={`/challenges/${primary.id}/log`} style={{ textDecoration: "none" }}>
          <Button variant="primary">Log an activity</Button>
        </Link>
      </div>

      {/* Edit / settings */}
      <div style={{ marginTop: "12px" }}>
        <Link href={`/challenges/${primary.id}/settings`} style={{ textDecoration: "none" }}>
          <Button variant="ghost">Edit challenge</Button>
        </Link>
      </div>

      {/* Leaderboard (friends + global) — fills the previously-flat area. */}
      <Leaderboard
        friends={friendsLeaderboard}
        global={globalLeaderboard}
        referralCode={referralCode}
      />

      {/* Other challenges */}
      {others.length > 0 && (
        <div style={{ marginTop: "40px" }}>
          <Label>Other challenges</Label>
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {others.map((c) => (
              <Card key={c.id}>
                <div style={{ padding: "16px" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-body, system-ui)",
                      fontSize: "15px",
                      color: "var(--text)",
                    }}
                  >
                    {c.title}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
