import { prisma } from "@project50/db";
import { localDayKey, dayNumber, addDays, PROJECT50_RULE_IDS } from "@project50/core";

export interface Project50Today {
  dayKey: string;
  dayNumber: number;
  checks: boolean[]; // length 7, index = ruleId - 1
  completedCount: number;
}

export interface Project50State {
  status: "NONE" | "ACTIVE" | "FAILED";
  runId?: string;
  today?: Project50Today;
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

export async function getProject50State(uid: string, now: Date = new Date()): Promise<Project50State> {
  const run = await activeRun(uid);
  if (!run) return { status: "NONE" };

  const todayKey = localDayKey(now, run.timezone);
  // (hard-reset evaluation added in Task 3c)
  return {
    status: "ACTIVE",
    runId: run.id,
    today: await buildToday(run.id, run.startDate, todayKey),
  };
}
