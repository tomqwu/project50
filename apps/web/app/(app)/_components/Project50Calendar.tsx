import type { CSSProperties } from "react";
import type { Project50DayStatus, Project50HistoryDay } from "@/lib/project50";

interface Props {
  days: Project50HistoryDay[];
}

// Per-status cell styling using Momentum CSS vars.
const CELL_STYLE: Record<Project50DayStatus, CSSProperties> = {
  complete: {
    background: "var(--accent)",
    color: "var(--bg)",
    border: "1px solid var(--accent)",
    fontWeight: 700,
  },
  incomplete: {
    background: "var(--muted)",
    color: "var(--bg)",
    border: "1px solid var(--hairline)",
  },
  today: {
    background: "transparent",
    color: "var(--text)",
    border: "2px solid var(--accent)",
    fontWeight: 700,
  },
  future: {
    background: "transparent",
    color: "var(--muted)",
    border: "1px solid var(--hairline)",
  },
};

const STATUS_LABEL: Record<Project50DayStatus, string> = {
  complete: "complete",
  incomplete: "missed",
  today: "today",
  future: "upcoming",
};

/**
 * Read-only 50-day progress calendar: a grid of cells, one per day of the run,
 * colored by completion status. Today is outlined; future days are blank.
 */
export function Project50Calendar({ days }: Props) {
  if (days.length === 0) return null;

  return (
    <section style={{ marginTop: 28 }} aria-label="50-day progress calendar">
      <h2
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 14,
          letterSpacing: "0.08em",
          color: "var(--muted)",
          margin: "0 0 12px",
        }}
      >
        Progress
      </h2>
      <div
        role="grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, 1fr)",
          gap: 6,
        }}
      >
        {days.map((day) => (
          <div
            key={day.dayNumber}
            role="gridcell"
            data-testid={`day-cell-${day.dayNumber}`}
            data-status={day.status}
            aria-current={day.status === "today" ? "date" : undefined}
            aria-label={`Day ${day.dayNumber}: ${STATUS_LABEL[day.status]}`}
            title={`Day ${day.dayNumber} · ${STATUS_LABEL[day.status]}`}
            style={{
              aspectRatio: "1 / 1",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              ...CELL_STYLE[day.status],
            }}
          >
            {day.dayNumber}
          </div>
        ))}
      </div>
    </section>
  );
}
