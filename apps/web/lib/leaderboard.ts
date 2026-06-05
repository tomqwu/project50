import { prisma } from "@project50/db";
import { localDayKey, dayNumber, PROJECT50_LENGTH_DAYS } from "@project50/core";

export type LeaderboardScope = "friends" | "global";

export interface LeaderboardEntry {
  /** 1-based position after sorting (currentDay desc, then completedDays desc). */
  rank: number;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /**
   * The day number (1..50) of the user's active PROJECT50 run, or 0 when they
   * have no active run.
   */
  currentDay: number;
  /** Total completed days across all of the user's PROJECT50 runs. */
  completedDays: number;
  /** True for the viewer's own row, so the UI can highlight it. */
  isMe: boolean;
}

export interface GetLeaderboardOptions {
  scope: LeaderboardScope;
  now?: Date;
}

/** Cap so a single leaderboard query/render never grows unbounded. */
const TOP_N = 50;

/**
 * Ranked Project 50 leaderboard for `uid`.
 *
 * - `friends` — the set { followees of uid } ∪ { uid }.
 * - `global`  — every user who owns at least one PROJECT50 run.
 *
 * The ranking metric is the current day number of the user's active run
 * (tie-break: total completed days). Rows are sorted currentDay desc then
 * completedDays desc and truncated to the top {@link TOP_N}.
 *
 * All data is fetched in bulk (a single challenge query, a single grouped
 * DayStatus count, a single user-profile query) — never per user — to avoid
 * N+1 round-trips.
 */
export async function getLeaderboard(
  uid: string,
  { scope, now = new Date() }: GetLeaderboardOptions,
): Promise<LeaderboardEntry[]> {
  // Resolve which PROJECT50 challenges feed the board.
  let challengeWhere: { kind: "PROJECT50"; ownerId?: { in: string[] } };
  if (scope === "friends") {
    const follows = await prisma.follow.findMany({
      where: { followerId: uid },
      select: { followeeId: true },
    });
    const ids = new Set<string>([uid, ...follows.map((f) => f.followeeId)]);
    challengeWhere = { kind: "PROJECT50", ownerId: { in: [...ids] } };
  } else {
    challengeWhere = { kind: "PROJECT50" };
  }

  const challenges = await prisma.challenge.findMany({
    where: challengeWhere,
    select: { id: true, ownerId: true, startDate: true, timezone: true, status: true },
    // Most-recently-started first, so picking the first ACTIVE run per user
    // yields the newest active run.
    orderBy: { startDate: "desc" },
  });

  if (challenges.length === 0) return [];

  // Bulk-count completed days per challenge (one grouped query).
  const completedCounts = await prisma.dayStatus.groupBy({
    by: ["challengeId"],
    where: {
      completed: true,
      challengeId: { in: challenges.map((c) => c.id) },
    },
    _count: { _all: true },
  });
  const completedByChallenge = new Map<string, number>(
    completedCounts.map((g) => [g.challengeId, g._count._all]),
  );

  // Bulk-fetch the owner profiles (one query).
  const ownerIds = [...new Set(challenges.map((c) => c.ownerId))];
  const users = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, handle: true, displayName: true, avatarUrl: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // Aggregate per owner: their newest active run's day number + total completed.
  interface Agg {
    currentDay: number;
    /** startDate of the active run that set currentDay; "" when none yet. */
    activeStart: string;
    completedDays: number;
  }
  const aggByOwner = new Map<string, Agg>();
  for (const c of challenges) {
    const agg =
      aggByOwner.get(c.ownerId) ?? { currentDay: 0, activeStart: "", completedDays: 0 };
    agg.completedDays += completedByChallenge.get(c.id) ?? 0;
    // Only an ACTIVE run contributes a current day. When a user has several
    // active runs, the most recently started one wins (highest startDate),
    // independent of row order.
    if (c.status === "ACTIVE" && c.startDate > agg.activeStart) {
      const todayKey = localDayKey(now, c.timezone);
      const raw = dayNumber(c.startDate, todayKey);
      agg.currentDay = Math.min(PROJECT50_LENGTH_DAYS, Math.max(1, raw));
      agg.activeStart = c.startDate;
    }
    aggByOwner.set(c.ownerId, agg);
  }

  const entries: Omit<LeaderboardEntry, "rank">[] = [];
  for (const ownerId of aggByOwner.keys()) {
    const u = userById.get(ownerId);
    if (!u) continue;
    const agg = aggByOwner.get(ownerId)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    entries.push({
      userId: ownerId,
      handle: u.handle,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      currentDay: agg.currentDay,
      completedDays: agg.completedDays,
      isMe: ownerId === uid,
    });
  }

  entries.sort(
    (a, b) => b.currentDay - a.currentDay || b.completedDays - a.completedDays,
  );

  return entries
    .slice(0, TOP_N)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}
