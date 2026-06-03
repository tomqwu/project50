import { prisma } from "@project50/db";
import {
  localDayKey,
  dayNumber,
  addDays,
  PROJECT50_RULE_IDS,
  PROJECT50_LENGTH_DAYS,
} from "@project50/core";

export interface Project50Today {
  dayKey: string;
  dayNumber: number;
  checks: boolean[]; // length 7, index = ruleId - 1
  completedCount: number;
}

export type Project50DayStatus = "complete" | "incomplete" | "today" | "future";

export interface Project50HistoryDay {
  dayNumber: number;
  dayKey: string;
  status: Project50DayStatus;
}

export interface Project50History {
  days: Project50HistoryDay[];
}

export interface Project50State {
  status: "NONE" | "ACTIVE" | "FAILED";
  runId?: string;
  today?: Project50Today;
  history?: Project50History;
  failedDayNumber?: number;
  failedRuleId?: number;
}

/** The active Project 50 run for a user, or null. */
async function activeRun(uid: string) {
  return prisma.challenge.findFirst({
    where: { ownerId: uid, kind: "PROJECT50", status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

/** Create a new Project 50 run starting today (in `timezone`). Returns the run id. */
export async function startProject50(
  uid: string,
  timezone: string,
  now: Date = new Date(),
): Promise<string> {
  const startDate = localDayKey(now, timezone);
  const run = await prisma.challenge.create({
    data: {
      ownerId: uid,
      title: "Project 50",
      goalType: "BINARY",
      startDate,
      timezone,
      lengthDays: 50,
      kind: "PROJECT50",
      status: "ACTIVE",
    },
  });
  return run.id;
}

/** Build today's checklist for a run. */
async function buildToday(runId: string, startDate: string, todayKey: string): Promise<Project50Today> {
  const checksRows = await prisma.ruleCheck.findMany({
    where: { challengeId: runId, dayKey: todayKey, done: true },
  });
  const doneIds = new Set(checksRows.map((c) => c.ruleId));
  const checks = PROJECT50_RULE_IDS.map((id) => doneIds.has(id));
  return {
    dayKey: todayKey,
    dayNumber: Math.max(1, dayNumber(startDate, todayKey)),
    checks,
    completedCount: checks.filter(Boolean).length,
  };
}

/**
 * Build the 50-day calendar for a run: one entry per Day 1..50.
 * `status` is "today" for the current local day, "future" for days after today,
 * "complete" if that day's DayStatus is completed, otherwise "incomplete".
 */
async function buildHistory(
  runId: string,
  startDate: string,
  todayKey: string,
): Promise<Project50History> {
  const lastKey = addDays(startDate, PROJECT50_LENGTH_DAYS - 1);
  const completedRows = await prisma.dayStatus.findMany({
    where: { challengeId: runId, completed: true, dayKey: { gte: startDate, lte: lastKey } },
    select: { dayKey: true },
  });
  const completedKeys = new Set(completedRows.map((r) => r.dayKey));

  const days: Project50HistoryDay[] = [];
  for (let i = 0; i < PROJECT50_LENGTH_DAYS; i++) {
    const dayKey = addDays(startDate, i);
    let status: Project50DayStatus;
    if (dayKey === todayKey) {
      status = "today";
    } else if (dayKey > todayKey) {
      status = "future";
    } else if (completedKeys.has(dayKey)) {
      status = "complete";
    } else {
      status = "incomplete";
    }
    days.push({ dayNumber: i + 1, dayKey, status });
  }
  return { days };
}

/**
 * Read-only 50-day progress calendar for the user's active Project 50 run.
 * Returns an empty list when there is no active run.
 */
export async function getProject50History(
  uid: string,
  now: Date = new Date(),
): Promise<Project50History> {
  const run = await activeRun(uid);
  if (!run) return { days: [] };
  const todayKey = localDayKey(now, run.timezone);
  return buildHistory(run.id, run.startDate, todayKey);
}

export async function getProject50State(uid: string, now: Date = new Date()): Promise<Project50State> {
  const run = await activeRun(uid);
  if (!run) return { status: "NONE" };

  const todayKey = localDayKey(now, run.timezone);

  // Hard reset: any elapsed past day (startDate .. yesterday) that is not 7/7 fails the run.
  const yesterdayKey = addDays(todayKey, -1);
  for (let d = run.startDate; d <= yesterdayKey; d = addDays(d, 1)) {
    const ds = await prisma.dayStatus.findUnique({
      where: { challengeId_dayKey: { challengeId: run.id, dayKey: d } },
    });
    if (!ds?.completed) {
      await prisma.challenge.update({ where: { id: run.id }, data: { status: "FAILED" } });
      const doneRows = await prisma.ruleCheck.findMany({
        where: { challengeId: run.id, dayKey: d, done: true },
      });
      const doneIds = new Set(doneRows.map((r) => r.ruleId));
      const failedRuleId = PROJECT50_RULE_IDS.find((id) => !doneIds.has(id));
      return {
        status: "FAILED",
        runId: run.id,
        failedDayNumber: Math.max(1, dayNumber(run.startDate, d)),
        failedRuleId,
      };
    }
  }

  return {
    status: "ACTIVE",
    runId: run.id,
    today: await buildToday(run.id, run.startDate, todayKey),
    history: await buildHistory(run.id, run.startDate, todayKey),
  };
}

/** Set a rule's done state for TODAY on the user's active run; recompute DayStatus. */
export async function toggleRule(
  uid: string,
  ruleId: number,
  done: boolean,
  now: Date = new Date(),
): Promise<void> {
  const run = await activeRun(uid);
  if (!run) throw new Error("No active Project 50 run");
  const todayKey = localDayKey(now, run.timezone);

  await prisma.ruleCheck.upsert({
    where: {
      challengeId_dayKey_ruleId: { challengeId: run.id, dayKey: todayKey, ruleId },
    },
    update: { done },
    create: { challengeId: run.id, dayKey: todayKey, ruleId, done },
  });

  const doneCount = await prisma.ruleCheck.count({
    where: { challengeId: run.id, dayKey: todayKey, done: true },
  });
  const completed = doneCount === PROJECT50_RULE_IDS.length;

  await prisma.dayStatus.upsert({
    where: { challengeId_dayKey: { challengeId: run.id, dayKey: todayKey } },
    update: { completed },
    create: { challengeId: run.id, dayKey: todayKey, completed },
  });
}
