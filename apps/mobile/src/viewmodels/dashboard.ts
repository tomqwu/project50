/**
 * Dashboard view-model (pure function).
 * Shapes raw API challenge data into a display-ready structure.
 * Reuses @project50/core for streak math and day numbering.
 */

import {
  dayNumber,
  currentStreak,
  longestStreak,
  computeDayCompletion,
  type GoalType,
  type DayKey,
} from "@project50/core";

// ─── Input types ─────────────────────────────────────────────────────────────

export interface DaySummary {
  dayKey: DayKey;
  completed: boolean;
  totalAmount: number;
}

export interface TodayActivity {
  amount?: number;
  done?: boolean;
}

export interface ChallengeForDashboard {
  id: string;
  title: string;
  goalType: GoalType;
  dailyTarget: number | null;
  unit: string | null;
  startDate: DayKey;
  lengthDays: number;
  dayStatuses?: DaySummary[];
  todayActivities?: TodayActivity[];
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface TodayProgress {
  goalType: GoalType;
  /** For TARGET: total amount logged today. For BINARY: 0. */
  totalAmount: number;
  /** For TARGET: the daily target. For BINARY: undefined. */
  dailyTarget: number | undefined;
  /** Unit label for TARGET challenges (e.g. "km"). */
  unit: string | undefined;
  /** Whether today's goal is met. */
  completed: boolean;
}

export interface OtherChallengeSummary {
  id: string;
  title: string;
  todayCompleted: boolean;
  currentStreak: number;
}

export interface DashboardViewModel {
  /** Challenge title. */
  title: string;
  /** 1-based day within the 50-day challenge. */
  dayNumber: number;
  /** Total days in challenge. */
  lengthDays: number;
  /** Today's progress for the primary challenge. */
  todayProgress: TodayProgress;
  /** Current streak (consecutive completed days up to and including today). */
  currentStreak: number;
  /** Longest ever streak. */
  longestStreak: number;
  /** Number of earned badges (milestones). */
  badges: number;
  /** Cheer count (reactions from followers). */
  cheering: number;
  /** Summary of other (non-primary) challenges. */
  otherChallenges: OtherChallengeSummary[];
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Build the dashboard view-model for the primary challenge.
 *
 * @param challenges - All challenges for the user. First element (or the one matching
 *                     primaryDetail.id) is treated as primary.
 * @param primaryDetail - The full detail of the primary challenge (includes dayStatuses
 *                        and todayActivities if pre-filtered).
 * @param todayDayKey - The current calendar day key (YYYY-MM-DD).
 * @param badges - Number of earned badges for the primary challenge.
 * @param cheering - Cheer count for the primary challenge.
 */
export function buildDashboard(
  challenges: ChallengeForDashboard[],
  primaryDetail: ChallengeForDashboard & {
    dayStatuses: DaySummary[];
    todayActivities: TodayActivity[];
    badges: number;
    cheering: number;
  },
  todayDayKey: DayKey,
): DashboardViewModel {
  const completedDayKeys = primaryDetail.dayStatuses
    .filter((ds) => ds.completed)
    .map((ds) => ds.dayKey);

  const streak = currentStreak(completedDayKeys, todayDayKey);
  const longest = longestStreak(completedDayKeys);

  const dayNum = dayNumber(primaryDetail.startDate, todayDayKey);

  const todayCompletion = computeDayCompletion(
    {
      goalType: primaryDetail.goalType,
      dailyTarget: primaryDetail.dailyTarget ?? undefined,
    },
    primaryDetail.todayActivities.map((a) => ({
      amount: a.amount,
      done: a.done,
    })),
  );

  const todayProgress: TodayProgress = {
    goalType: primaryDetail.goalType,
    totalAmount: todayCompletion.totalAmount,
    dailyTarget:
      primaryDetail.goalType === "TARGET"
        ? (primaryDetail.dailyTarget ?? undefined)
        : undefined,
    unit:
      primaryDetail.goalType === "TARGET"
        ? (primaryDetail.unit ?? undefined)
        : undefined,
    completed: todayCompletion.completed,
  };

  // Other challenges (all except primary)
  const otherChallenges: OtherChallengeSummary[] = challenges
    .filter((c) => c.id !== primaryDetail.id)
    .map((c) => {
      const otherCompletedDays = (c.dayStatuses ?? [])
        .filter((ds) => ds.completed)
        .map((ds) => ds.dayKey);

      const todayStatus = (c.dayStatuses ?? []).find((ds) => ds.dayKey === todayDayKey);

      return {
        id: c.id,
        title: c.title,
        todayCompleted: todayStatus?.completed ?? false,
        currentStreak: currentStreak(otherCompletedDays, todayDayKey),
      };
    });

  return {
    title: primaryDetail.title,
    dayNumber: dayNum,
    lengthDays: primaryDetail.lengthDays,
    todayProgress,
    currentStreak: streak,
    longestStreak: longest,
    badges: primaryDetail.badges,
    cheering: primaryDetail.cheering,
    otherChallenges,
  };
}
