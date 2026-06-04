import { prisma } from "@project50/db";
import { localDayKey } from "@project50/core";
import { activeRun } from "@/lib/project50";

/** The free-text reflection for one Project 50 day. */
export interface JournalEntry {
  wins: string;
  lessons: string;
}

/**
 * Upsert today's journal entry (rule #7 "Track progress") for the user's active
 * Project 50 run. Resolves the active run (throws if none, like toggleRule), then
 * writes one DayJournal row keyed to the run's local dayKey. The unique
 * constraint on (challengeId, dayKey) makes this an in-place upsert.
 */
export async function upsertJournal(
  uid: string,
  entry: JournalEntry,
  now: Date = new Date(),
): Promise<void> {
  const run = await activeRun(uid);
  if (!run) throw new Error("No active Project 50 run");
  const dayKey = localDayKey(now, run.timezone);
  await prisma.dayJournal.upsert({
    where: { challengeId_dayKey: { challengeId: run.id, dayKey } },
    update: { wins: entry.wins, lessons: entry.lessons },
    create: { challengeId: run.id, dayKey, wins: entry.wins, lessons: entry.lessons },
  });
}

/**
 * Read today's journal entry for the user's active Project 50 run, or null when
 * there is no active run or the day has no saved entry yet.
 */
export async function getTodayJournal(
  uid: string,
  now: Date = new Date(),
): Promise<JournalEntry | null> {
  const run = await activeRun(uid);
  if (!run) return null;
  const dayKey = localDayKey(now, run.timezone);
  const row = await prisma.dayJournal.findUnique({
    where: { challengeId_dayKey: { challengeId: run.id, dayKey } },
    select: { wins: true, lessons: true },
  });
  return row ? { wins: row.wins, lessons: row.lessons } : null;
}
