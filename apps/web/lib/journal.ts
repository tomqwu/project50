import { prisma } from "@project50/db";
import { addDays, localDayKey } from "@project50/core";
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
 *
 * `submittedDayKey` is the day the CLIENT's editor was showing when the user
 * saved. The dashboard can stay open across the run's local midnight, so server
 * `now` may already be a later day than the text on screen — persisting under
 * server-now would file yesterday's reflection into today's journal. When the
 * client supplies its dayKey we persist under it instead of recomputing from
 * `now`, but only after validating it is the current or the immediately previous
 * local day; anything else (stale tab, future, clock skew) is rejected so we
 * never silently misfile an entry. Omitting it preserves the old behaviour.
 */
export async function upsertJournal(
  uid: string,
  entry: JournalEntry,
  now: Date = new Date(),
  submittedDayKey?: string,
): Promise<void> {
  const run = await activeRun(uid);
  if (!run) throw new Error("No active Project 50 run");
  const serverDayKey = localDayKey(now, run.timezone);
  let dayKey = serverDayKey;
  if (submittedDayKey !== undefined && submittedDayKey !== serverDayKey) {
    // Only the immediately previous local day is an acceptable mismatch — the
    // "open across midnight then save" case. Reject everything else.
    if (submittedDayKey !== addDays(serverDayKey, -1)) {
      throw new Error(
        `Journal day ${submittedDayKey} is outside the allowed window (current ${serverDayKey} or previous day)`,
      );
    }
    dayKey = submittedDayKey;
  }
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
