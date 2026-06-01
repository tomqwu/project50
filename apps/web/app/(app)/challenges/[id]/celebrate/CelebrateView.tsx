import { Card, Label, StatTile } from "@project50/ui";
import { ShareActions } from "./ShareActions";
import type { ShareActionsProps } from "./ShareActions";

export type MilestoneKind =
  | "COMPLETED_7"
  | "COMPLETED_25"
  | "COMPLETED_50"
  | "STREAK_7"
  | "STREAK_30";

export interface CelebrateStats {
  daysCompleted: number;
  totalAmount?: number | null;
  unit?: string | null;
}

export interface CelebrateViewProps {
  challengeTitle: string;
  dayNumber: number;
  stats: CelebrateStats;
  milestones: MilestoneKind[];
  shareActions?: ShareActionsProps;
}

const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  COMPLETED_7: "7 days done",
  COMPLETED_25: "25 days done",
  COMPLETED_50: "50 days done",
  STREAK_7: "7-day streak",
  STREAK_30: "30-day streak",
};

export function CelebrateView({
  challengeTitle,
  dayNumber,
  stats,
  milestones,
  shareActions,
}: CelebrateViewProps) {
  const isComplete = dayNumber >= 50;

  return (
    <div
      style={{
        padding: "48px 32px",
        maxWidth: "480px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      {/* Headline */}
      <Label>{isComplete ? "Challenge complete" : "Milestone reached"}</Label>
      <h1
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "36px",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: isComplete ? "var(--accent)" : "var(--text)",
          margin: "12px 0 8px",
        }}
        data-testid="celebrate-title"
      >
        {isComplete ? "Day 50 complete" : challengeTitle}
      </h1>

      <p
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "18px",
          color: "var(--muted)",
          marginBottom: "40px",
        }}
      >
        Day {dayNumber} / 50
      </p>

      {/* Stats */}
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            padding: "28px 16px",
          }}
        >
          <StatTile value={stats.daysCompleted} label="Days done" accent />
          {stats.totalAmount !== null && stats.totalAmount !== undefined && (
            <StatTile
              value={`${stats.totalAmount}${stats.unit ? ` ${stats.unit}` : ""}`}
              label="Total"
            />
          )}
        </div>
      </Card>

      {/* Earned badges */}
      {milestones.length > 0 && (
        <div style={{ marginTop: "32px" }}>
          <Label>Earned badges</Label>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "center",
              marginTop: "12px",
            }}
          >
            {milestones.map((m) => (
              <span
                key={m}
                data-testid={`badge-${m}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "999px",
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                  fontFamily: "var(--font-body, system-ui)",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {MILESTONE_LABELS[m]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Share actions */}
      {shareActions ? (
        <ShareActions {...shareActions} />
      ) : null}
    </div>
  );
}
