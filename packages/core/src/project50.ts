export const PROJECT50_LENGTH_DAYS = 50;

export interface Project50Rule {
  id: number; // 1..7
  title: string;
  detail: string;
}

export const PROJECT50_RULES: readonly Project50Rule[] = [
  { id: 1, title: "Wake up before 8 AM", detail: "+ 6h sleep, consistent schedule" },
  { id: 2, title: "Morning routine", detail: "1 hour, no phone/distraction" },
  { id: 3, title: "Exercise", detail: "1 hour, any activity" },
  { id: 4, title: "Read", detail: "10 pages of nonfiction" },
  { id: 5, title: "Learn a skill", detail: "1 hour" },
  { id: 6, title: "Drink water / eat clean", detail: "stay hydrated, healthy diet" },
  { id: 7, title: "Track progress", detail: "journal the day (wins + lessons)" },
] as const;

export const PROJECT50_RULE_IDS: readonly number[] = PROJECT50_RULES.map((r) => r.id);

import { addDays, dayNumber, type DayKey } from "./dates";

export interface Project50CurrentDayInput {
  /** Local day key the run started on. */
  startDate: DayKey;
  /** The run's local day key for "now". */
  todayKey: DayKey;
  /** Day keys whose DayStatus is completed (7/7). Order/duplicates don't matter. */
  completedDayKeys: readonly string[];
}

/**
 * The current day number (1..{@link PROJECT50_LENGTH_DAYS}) of a Project 50 run
 * that is still *alive*, or 0 if the run should already have hard-reset / has
 * not begun.
 *
 * A Project 50 run is all-or-nothing: every elapsed past day must be completed
 * (7/7) for the run to survive. The compliance window is clamped to the program
 * length — only days 1..{@link PROJECT50_LENGTH_DAYS} are checked, so a run that
 * finished all 50 days but hasn't yet been lazily flipped to COMPLETED (today is
 * past day 50) still reports 50 rather than demanding day-51+ rows that can
 * never exist. This is the single source of truth for that compliance check —
 * `getProject50State` enforces the same rule when it lazily flips a stale ACTIVE
 * run to FAILED, and the leaderboard uses this so a run that already missed a
 * day cannot keep climbing the ranking just because its persisted status hasn't
 * been updated yet.
 */
export function project50CurrentDay({
  startDate,
  todayKey,
  completedDayKeys,
}: Project50CurrentDayInput): number {
  const raw = dayNumber(startDate, todayKey);
  // Not started yet (today is before the start day).
  if (raw < 1) return 0;

  // Every elapsed past day must be completed, but only within the program
  // window (days 1..N): the last day that can require completion is min(
  // yesterday, day N). Beyond day N the program is over and no rows exist.
  const completed = new Set(completedDayKeys);
  const yesterdayKey = addDays(todayKey, -1);
  const lastProgramDayKey = addDays(startDate, PROJECT50_LENGTH_DAYS - 1);
  const lastCheckKey =
    yesterdayKey < lastProgramDayKey ? yesterdayKey : lastProgramDayKey;
  for (let d = startDate; d <= lastCheckKey; d = addDays(d, 1)) {
    if (!completed.has(d)) return 0;
  }

  return Math.min(PROJECT50_LENGTH_DAYS, raw);
}
