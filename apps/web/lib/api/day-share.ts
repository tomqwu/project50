import { prisma } from "@project50/db";
import { addDays, PROJECT50_RULE_IDS } from "@project50/core";
import { getChallengeByShareId } from "@/lib/api/challenges";
import { listProject50DayMedia } from "@/lib/project50";

/** One photo on a public day — only the signed view URL is exposed. */
export interface PublicDayMedia {
  url: string;
}

/** The public, read-only view of a single Project 50 day. */
export interface PublicDay {
  /** The PUBLIC challenge the day belongs to (as loaded by getChallengeByShareId). */
  challenge: Awaited<ReturnType<typeof getChallengeByShareId>>;
  /** 1-based day number within the run (1..lengthDays). */
  dayNumber: number;
  /** The run-local YYYY-MM-DD key for the day. */
  dayKey: string;
  /** Number of the 7 rules checked on the day (0..7). */
  rulesCompleted: number;
  /** Per-rule completion, index = ruleId - 1 (length 7). */
  ruleChecks: boolean[];
  /** Photos attached to the day, oldest first, with signed view URLs. */
  media: PublicDayMedia[];
  /** The day's journal reflection, when one was saved. */
  journal?: { wins: string; lessons: string };
}

/**
 * Load the public, read-only view of a single completed Project 50 day for the
 * unauthenticated `/c/[shareId]/day/[day]` page.
 *
 * Visibility is gated by reusing getChallengeByShareId, which returns null for a
 * missing or non-PUBLIC challenge — we propagate that null. `dayNumber` must be
 * an integer in [1 .. lengthDays]; anything else returns null (so out-of-range
 * or junk day params 404 rather than rendering an empty day). The day's local
 * key is derived purely from the stored start date via addDays(startDate, n-1),
 * so it is timezone-safe (no `new Date()` slice).
 */
export async function getPublicDay(
  shareId: string,
  dayNumber: number,
): Promise<PublicDay | null> {
  const challenge = await getChallengeByShareId(shareId);
  if (!challenge) return null;

  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > challenge.lengthDays) {
    return null;
  }

  const dayKey = addDays(challenge.startDate, dayNumber - 1);

  const [checkRows, media, journalRow] = await Promise.all([
    prisma.ruleCheck.findMany({
      where: { challengeId: challenge.id, dayKey, done: true },
    }),
    listProject50DayMedia(challenge.id, dayKey),
    prisma.dayJournal.findUnique({
      where: { challengeId_dayKey: { challengeId: challenge.id, dayKey } },
      select: { wins: true, lessons: true },
    }),
  ]);

  const doneIds = new Set(checkRows.map((c) => c.ruleId));
  const ruleChecks = PROJECT50_RULE_IDS.map((id) => doneIds.has(id));
  const rulesCompleted = ruleChecks.filter(Boolean).length;

  return {
    challenge,
    dayNumber,
    dayKey,
    rulesCompleted,
    ruleChecks,
    media: media.map((m) => ({ url: m.url })),
    ...(journalRow ? { journal: { wins: journalRow.wins, lessons: journalRow.lessons } } : {}),
  };
}
