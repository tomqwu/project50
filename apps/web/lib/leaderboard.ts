import { prisma } from "@project50/db";
import { localDayKey, project50CurrentDay } from "@project50/core";

export type LeaderboardScope = "friends" | "global";

type Visibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";

/**
 * Minimal structural shape of the challenge `where` filter this module builds.
 * Kept local (rather than importing Prisma's generated namespace, which the db
 * package doesn't re-export) and assignable to `challenge.findMany`'s argument.
 */
interface ChallengeWhere {
  kind: "PROJECT50";
  visibility?: Visibility;
  ownerId?: { in: string[] };
  OR?: Array<{
    ownerId?: string | { in: string[] };
    visibility?: { in: Visibility[] };
  }>;
}

export interface LeaderboardEntry {
  /** 1-based position after sorting (currentDay desc, then completedDays desc). */
  rank: number;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /**
   * The day number (1..50) of the user's active, *still-alive* PROJECT50 run,
   * or 0 when they have no such run.
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

/** Cap so a single leaderboard render only ever returns the top runners. */
const TOP_N = 50;

/**
 * Upper bound on candidate runs pulled from the DB for the *global* scope.
 *
 * Why this is safe: ranking is currentDay-primary, currentDay is itself bounded
 * at 50 (the program length), and currentDay grows monotonically with how early
 * a run started. So the 50 highest-currentDay runs are necessarily among the
 * earliest-started ones. Ordering candidates by `startDate asc` and taking this
 * many leaves ample headroom for the completedDays tie-break inside the
 * day-50 cohort, so the final top-{@link TOP_N} is exact without scanning the
 * whole (growing) challenge table. (The `friends` scope is already bounded by
 * the viewer's follow count, so the cap is only material for `global`.)
 */
const GLOBAL_CANDIDATE_LIMIT = 500;

/**
 * Ranked Project 50 leaderboard for `uid`.
 *
 * - `friends` — runs owned by { followees of uid } ∪ { uid }, honoring
 *   per-run visibility: a followee's run counts only if it is PUBLIC or
 *   FOLLOWERS; the viewer's own runs always count (it's their dashboard).
 * - `global`  — PUBLIC PROJECT50 runs only.
 *
 * The ranking metric is the current day number of the user's active run
 * (tie-break: total completed days). A run only contributes a current day if it
 * is still *alive* under the all-or-nothing hard-reset rule (every elapsed past
 * day completed) — see {@link project50CurrentDay} — so a stale ACTIVE run that
 * already missed a day cannot keep climbing before its status is flipped.
 *
 * All data is fetched in bulk (one bounded challenge query, one DayStatus query,
 * one user-profile query) — never per user — to avoid N+1 round-trips.
 */
export async function getLeaderboard(
  uid: string,
  { scope, now = new Date() }: GetLeaderboardOptions,
): Promise<LeaderboardEntry[]> {
  // Resolve the visibility-aware challenge filter for the scope.
  let where: ChallengeWhere;
  let take: number | undefined;
  if (scope === "friends") {
    const follows = await prisma.follow.findMany({
      where: { followerId: uid },
      select: { followeeId: true },
    });
    const followeeIds = follows.map((f) => f.followeeId);
    const ownerIds = [...new Set<string>([uid, ...followeeIds])];
    where = {
      kind: "PROJECT50",
      ownerId: { in: ownerIds },
      OR: [
        // The viewer's own runs, regardless of visibility.
        { ownerId: uid },
        // Followees' runs visible to a follower: PUBLIC or FOLLOWERS.
        { ownerId: { in: followeeIds }, visibility: { in: ["PUBLIC", "FOLLOWERS"] } },
      ],
    };
  } else {
    where = { kind: "PROJECT50", visibility: "PUBLIC" };
    take = GLOBAL_CANDIDATE_LIMIT;
  }

  const challenges = await prisma.challenge.findMany({
    where,
    select: { id: true, ownerId: true, startDate: true, timezone: true, status: true },
    // Earliest-started first: the highest-currentDay (top-ranked) runs are the
    // earliest-started ones, so this ordering + `take` keeps the bounded global
    // candidate set correct. Secondary id keeps the order stable.
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    ...(take !== undefined ? { take } : {}),
  });

  if (challenges.length === 0) return [];

  // Bulk-fetch all completed DayStatus rows for these runs (one query). The rows
  // serve double duty: their count is `completedDays`, and their day keys feed
  // the per-run hard-reset compliance check.
  const dayRows = await prisma.dayStatus.findMany({
    where: { completed: true, challengeId: { in: challenges.map((c) => c.id) } },
    select: { challengeId: true, dayKey: true },
  });
  const completedKeysByChallenge = new Map<string, string[]>();
  for (const r of dayRows) {
    const list = completedKeysByChallenge.get(r.challengeId);
    if (list) list.push(r.dayKey);
    else completedKeysByChallenge.set(r.challengeId, [r.dayKey]);
  }

  // Bulk-fetch the owner profiles (one query).
  const ownerIds = [...new Set(challenges.map((c) => c.ownerId))];
  const users = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, handle: true, displayName: true, avatarUrl: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // Aggregate per owner: their newest *still-alive* active run's day number plus
  // total completed days across all of their runs.
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
    const completedKeys = completedKeysByChallenge.get(c.id) ?? [];
    agg.completedDays += completedKeys.length;
    // Only an ACTIVE run can contribute a current day, and only if it is still
    // alive under the hard-reset rule. When a user has several active runs, the
    // most recently started living one wins (highest startDate).
    if (c.status === "ACTIVE" && c.startDate > agg.activeStart) {
      const todayKey = localDayKey(now, c.timezone);
      const day = project50CurrentDay({
        startDate: c.startDate,
        todayKey,
        completedDayKeys: completedKeys,
      });
      if (day > 0) {
        agg.currentDay = day;
        agg.activeStart = c.startDate;
      }
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

  return entries.slice(0, TOP_N).map((e, i) => ({ ...e, rank: i + 1 }));
}
