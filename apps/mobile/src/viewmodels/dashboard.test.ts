/**
 * Unit tests for dashboard.ts view-model (pure function).
 * Covers TARGET/BINARY, empty/partial/complete, streak/badge/cheering,
 * other challenges summary.
 */

import { buildDashboard } from "./dashboard";
import type { ChallengeForDashboard, DaySummary, TodayActivity } from "./dashboard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type PrimaryInput = Partial<ChallengeForDashboard & { dayStatuses: DaySummary[]; todayActivities: TodayActivity[]; badges: number; cheering: number }>;

function makeTargetChallenge(overrides: PrimaryInput = {}): ChallengeForDashboard & {
  dayStatuses: DaySummary[];
  todayActivities: TodayActivity[];
  badges: number;
  cheering: number;
} {
  return {
    id: "c1",
    title: "Run 5K Daily",
    goalType: "TARGET",
    dailyTarget: 5,
    unit: "km",
    startDate: "2026-01-01",
    lengthDays: 50,
    dayStatuses: [],
    todayActivities: [],
    badges: 0,
    cheering: 0,
    ...overrides,
  };
}

function makeBinaryChallenge(overrides: PrimaryInput = {}): ChallengeForDashboard & {
  dayStatuses: DaySummary[];
  todayActivities: TodayActivity[];
  badges: number;
  cheering: number;
} {
  return {
    id: "c2",
    title: "Meditate Daily",
    goalType: "BINARY",
    dailyTarget: null,
    unit: null,
    startDate: "2026-01-01",
    lengthDays: 50,
    dayStatuses: [],
    todayActivities: [],
    badges: 0,
    cheering: 0,
    ...overrides,
  };
}

const TODAY = "2026-01-15";

// ─── TARGET challenge ─────────────────────────────────────────────────────────

describe("buildDashboard — TARGET challenge", () => {
  it("returns correct title and lengthDays", () => {
    const primary = makeTargetChallenge();
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.title).toBe("Run 5K Daily");
    expect(vm.lengthDays).toBe(50);
  });

  it("computes dayNumber correctly (day 15 of challenge starting 2026-01-01)", () => {
    const primary = makeTargetChallenge();
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.dayNumber).toBe(15);
  });

  it("computes dayNumber = 1 for challenge starting today", () => {
    const primary = makeTargetChallenge({ startDate: TODAY });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.dayNumber).toBe(1);
  });

  it("returns empty/incomplete state when no activities today", () => {
    const primary = makeTargetChallenge({ todayActivities: [] });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.completed).toBe(false);
    expect(vm.todayProgress.totalAmount).toBe(0);
    expect(vm.todayProgress.dailyTarget).toBe(5);
    expect(vm.todayProgress.unit).toBe("km");
    expect(vm.todayProgress.goalType).toBe("TARGET");
  });

  it("returns partial progress when amount < target", () => {
    const primary = makeTargetChallenge({
      todayActivities: [{ amount: 3 }],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.completed).toBe(false);
    expect(vm.todayProgress.totalAmount).toBe(3);
  });

  it("returns completed when amount >= target", () => {
    const primary = makeTargetChallenge({
      todayActivities: [{ amount: 5 }],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.completed).toBe(true);
    expect(vm.todayProgress.totalAmount).toBe(5);
  });

  it("sums multiple activities for TARGET", () => {
    const primary = makeTargetChallenge({
      todayActivities: [{ amount: 2 }, { amount: 3 }],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.totalAmount).toBe(5);
    expect(vm.todayProgress.completed).toBe(true);
  });

  it("exceeds target sums correctly", () => {
    const primary = makeTargetChallenge({
      todayActivities: [{ amount: 7 }],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.totalAmount).toBe(7);
    expect(vm.todayProgress.completed).toBe(true);
  });

  it("returns zero streak and longest streak when no completed days", () => {
    const primary = makeTargetChallenge({ dayStatuses: [] });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.currentStreak).toBe(0);
    expect(vm.longestStreak).toBe(0);
  });

  it("computes streak correctly for consecutive completed days ending today", () => {
    const primary = makeTargetChallenge({
      dayStatuses: [
        { dayKey: "2026-01-13", completed: true, totalAmount: 5 },
        { dayKey: "2026-01-14", completed: true, totalAmount: 5 },
        { dayKey: TODAY, completed: true, totalAmount: 5 },
      ],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.currentStreak).toBe(3);
    expect(vm.longestStreak).toBe(3);
  });

  it("streak is 0 when today is not completed (gap)", () => {
    const primary = makeTargetChallenge({
      dayStatuses: [
        { dayKey: "2026-01-13", completed: true, totalAmount: 5 },
        { dayKey: "2026-01-14", completed: true, totalAmount: 5 },
        // today not completed
      ],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.currentStreak).toBe(0);
    expect(vm.longestStreak).toBe(2);
  });

  it("does not count incomplete day statuses in streak", () => {
    const primary = makeTargetChallenge({
      dayStatuses: [
        { dayKey: "2026-01-14", completed: false, totalAmount: 2 },
        { dayKey: TODAY, completed: true, totalAmount: 5 },
      ],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.currentStreak).toBe(1);
    expect(vm.longestStreak).toBe(1);
  });

  it("returns badges and cheering from primary", () => {
    const primary = makeTargetChallenge({ badges: 3, cheering: 7 });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.badges).toBe(3);
    expect(vm.cheering).toBe(7);
  });
});

// ─── BINARY challenge ─────────────────────────────────────────────────────────

describe("buildDashboard — BINARY challenge", () => {
  it("reports goalType BINARY", () => {
    const primary = makeBinaryChallenge();
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.goalType).toBe("BINARY");
  });

  it("dailyTarget and unit are undefined for BINARY", () => {
    const primary = makeBinaryChallenge();
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.dailyTarget).toBeUndefined();
    expect(vm.todayProgress.unit).toBeUndefined();
  });

  it("totalAmount is 0 for BINARY (no amount tracking)", () => {
    const primary = makeBinaryChallenge({ todayActivities: [{ done: true }] });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.totalAmount).toBe(0);
  });

  it("completed is false when no activities", () => {
    const primary = makeBinaryChallenge({ todayActivities: [] });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.completed).toBe(false);
  });

  it("completed is true when any activity has done=true", () => {
    const primary = makeBinaryChallenge({ todayActivities: [{ done: true }] });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.completed).toBe(true);
  });

  it("completed is false when done=false", () => {
    const primary = makeBinaryChallenge({ todayActivities: [{ done: false }] });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.completed).toBe(false);
  });

  it("completed is true if any of multiple activities has done=true", () => {
    const primary = makeBinaryChallenge({
      todayActivities: [{ done: false }, { done: true }],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.completed).toBe(true);
  });

  it("streak works the same as TARGET", () => {
    const primary = makeBinaryChallenge({
      dayStatuses: [
        { dayKey: "2026-01-14", completed: true, totalAmount: 0 },
        { dayKey: TODAY, completed: true, totalAmount: 0 },
      ],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.currentStreak).toBe(2);
  });
});

// ─── Other challenges ─────────────────────────────────────────────────────────

describe("buildDashboard — other challenges", () => {
  it("returns empty otherChallenges when no other challenges", () => {
    const primary = makeTargetChallenge();
    const vm = buildDashboard([primary], primary, TODAY);
    expect(vm.otherChallenges).toHaveLength(0);
  });

  it("excludes the primary challenge from other challenges", () => {
    const primary = makeTargetChallenge({ id: "c1" });
    const other: ChallengeForDashboard = {
      id: "c3",
      title: "Read 30 pages",
      goalType: "TARGET",
      dailyTarget: 30,
      unit: "pages",
      startDate: "2026-01-01",
      lengthDays: 50,
    };
    const vm = buildDashboard([primary, other], primary, TODAY);
    expect(vm.otherChallenges).toHaveLength(1);
    expect(vm.otherChallenges[0]!.id).toBe("c3");
  });

  it("computes todayCompleted for other challenges", () => {
    const primary = makeTargetChallenge({ id: "c1" });
    const other: ChallengeForDashboard = {
      id: "c3",
      title: "Read 30 pages",
      goalType: "TARGET",
      dailyTarget: 30,
      unit: "pages",
      startDate: "2026-01-01",
      lengthDays: 50,
      dayStatuses: [{ dayKey: TODAY, completed: true, totalAmount: 30 }],
    };
    const vm = buildDashboard([primary, other], primary, TODAY);
    expect(vm.otherChallenges[0]!.todayCompleted).toBe(true);
  });

  it("todayCompleted is false when other challenge not completed today", () => {
    const primary = makeTargetChallenge({ id: "c1" });
    const other: ChallengeForDashboard = {
      id: "c3",
      title: "Read 30 pages",
      goalType: "TARGET",
      dailyTarget: 30,
      unit: "pages",
      startDate: "2026-01-01",
      lengthDays: 50,
      dayStatuses: [{ dayKey: "2026-01-14", completed: true, totalAmount: 30 }],
    };
    const vm = buildDashboard([primary, other], primary, TODAY);
    expect(vm.otherChallenges[0]!.todayCompleted).toBe(false);
  });

  it("todayCompleted is false when other challenge has no dayStatuses", () => {
    const primary = makeTargetChallenge({ id: "c1" });
    const other: ChallengeForDashboard = {
      id: "c3",
      title: "Read 30 pages",
      goalType: "TARGET",
      dailyTarget: 30,
      unit: "pages",
      startDate: "2026-01-01",
      lengthDays: 50,
      // no dayStatuses
    };
    const vm = buildDashboard([primary, other], primary, TODAY);
    expect(vm.otherChallenges[0]!.todayCompleted).toBe(false);
  });

  it("computes streak for other challenges", () => {
    const primary = makeTargetChallenge({ id: "c1" });
    const other: ChallengeForDashboard = {
      id: "c3",
      title: "Meditate",
      goalType: "BINARY",
      dailyTarget: null,
      unit: null,
      startDate: "2026-01-01",
      lengthDays: 50,
      dayStatuses: [
        { dayKey: "2026-01-14", completed: true, totalAmount: 0 },
        { dayKey: TODAY, completed: true, totalAmount: 0 },
      ],
    };
    const vm = buildDashboard([primary, other], primary, TODAY);
    expect(vm.otherChallenges[0]!.currentStreak).toBe(2);
  });

  it("handles multiple other challenges", () => {
    const primary = makeTargetChallenge({ id: "c1" });
    const other1: ChallengeForDashboard = { id: "c3", title: "A", goalType: "BINARY", dailyTarget: null, unit: null, startDate: "2026-01-01", lengthDays: 50 };
    const other2: ChallengeForDashboard = { id: "c4", title: "B", goalType: "BINARY", dailyTarget: null, unit: null, startDate: "2026-01-01", lengthDays: 50 };
    const vm = buildDashboard([primary, other1, other2], primary, TODAY);
    expect(vm.otherChallenges).toHaveLength(2);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("buildDashboard — edge cases", () => {
  it("handles dailyTarget=null for TARGET (treated as 0, never completes)", () => {
    const primary = makeTargetChallenge({
      dailyTarget: null,
      todayActivities: [{ amount: 5 }],
    });
    const vm = buildDashboard([], primary, TODAY);
    // computeDayCompletion: target=0, completed only if target>0
    expect(vm.todayProgress.completed).toBe(false);
  });

  it("handles unit=null for TARGET (unit becomes undefined in progress)", () => {
    const primary = makeTargetChallenge({
      unit: null,
      todayActivities: [{ amount: 3 }],
    });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.todayProgress.unit).toBeUndefined();
  });

  it("handles challenge with many completed days (long streak)", () => {
    const days: DaySummary[] = [];
    for (let i = 1; i <= 14; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      days.push({ dayKey: `2026-01-${dayStr}`, completed: true, totalAmount: 5 });
    }
    days.push({ dayKey: TODAY, completed: true, totalAmount: 5 });
    const primary = makeTargetChallenge({ dayStatuses: days });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.currentStreak).toBe(15);
    expect(vm.longestStreak).toBe(15);
  });

  it("dayNumber is correct for later in challenge", () => {
    const primary = makeTargetChallenge({ startDate: "2026-01-01" });
    const vm = buildDashboard([], primary, "2026-02-19"); // day 50
    expect(vm.dayNumber).toBe(50);
  });

  it("returns all zeros/empty for a brand-new challenge", () => {
    const primary = makeTargetChallenge({ startDate: TODAY });
    const vm = buildDashboard([], primary, TODAY);
    expect(vm.currentStreak).toBe(0);
    expect(vm.longestStreak).toBe(0);
    expect(vm.badges).toBe(0);
    expect(vm.cheering).toBe(0);
    expect(vm.otherChallenges).toHaveLength(0);
    expect(vm.todayProgress.completed).toBe(false);
  });
});
