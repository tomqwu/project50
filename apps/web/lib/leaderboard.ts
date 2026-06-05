import { prisma } from "@project50/db";
import { localDayKey, addDays, project50CurrentDay, PROJECT50_LENGTH_DAYS } from "@project50/core";

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
  status?: "ACTIVE";
  startDate?: { gte: string };
  ownerId?: { in: string[] };
  OR?: Array<{
    ownerId?: string | { in: string[] };
    visibility?: { in: Visibility[] };
  }>;
}

/** The owner + visibility portion of a challenge filter, shared by both queries. */
type VisibilityWhere = Pick<ChallengeWhere, "visibility" | "ownerId" | "OR">;

/**
 * Build the owner/visibility `where` fragment a viewer is allowed to see in a
 * scope, restricted to `ownerIds`. This is the SINGLE source of the visibility
 * rule, used by BOTH the candidate query and the cross-run completedDays
 * aggregate so they can never drift (a private run hidden from one must be
 * hidden from the other):
 *
 * - `global`  — PUBLIC runs only.
 * - `friends` — the viewer's OWN runs (any visibility) plus followees' runs that
 *   are PUBLIC or FOLLOWERS. (`followeeIds` is empty for global.)
 */
function visibilityWhere(
  scope: LeaderboardScope,
  uid: string,
  followeeIds: string[],
  ownerIds: string[],
): VisibilityWhere {
  if (scope === "global") {
    return { visibility: "PUBLIC", ownerId: { in: ownerIds } };
  }
  return {
    ownerId: { in: ownerIds },
    OR: [
      // The viewer's own runs, regardless of visibility.
      { ownerId: uid },
      // Followees' runs visible to a follower: PUBLIC or FOLLOWERS.
      { ownerId: { in: followeeIds }, visibility: { in: ["PUBLIC", "FOLLOWERS"] } },
    ],
  };
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
 * All data is fetched in bulk (a candidate challenge query, an owner-aggregate
 * challenge query, one DayStatus query, one user-profile query) — every query
 * bounded by the candidate owner set, never per user — to avoid N+1 round-trips.
 * The owner-aggregate query exists so `completedDays` (the tie-break) totals a
 * user's days across ALL their PROJECT50 runs, including prior FAILED/COMPLETED
 * ones, not just the live candidate run.
 *
 * The *global* candidate set is bounded by a **time window** rather than a blind
 * row cap: a run can only be a currently-active racer if it is ACTIVE and
 * started within the program length (the last {@link PROJECT50_LENGTH_DAYS}
 * days, plus a day of timezone slack). Filtering on `startDate >= today-N` +
 * `status: ACTIVE` keeps the scan bounded and indexed without ever dropping a
 * genuinely-rankable run (a blind earliest-N cap could be filled by old day-0
 * stale runs and starve newer active racers). The `friends` scope is already
 * bounded by the follow count.
 */
export async function getLeaderboard(
  uid: string,
  { scope, now = new Date() }: GetLeaderboardOptions,
): Promise<LeaderboardEntry[]> {
  // Resolve the set of followees once (empty for global) so the same visibility
  // rule can be applied to both the candidate and the aggregate queries.
  let followeeIds: string[] = [];
  if (scope === "friends") {
    const follows = await prisma.follow.findMany({
      where: { followerId: uid },
      select: { followeeId: true },
    });
    followeeIds = follows.map((f) => f.followeeId);
  }

  // Candidate query: the runs that can currently rank.
  let where: ChallengeWhere;
  if (scope === "friends") {
    const ownerIds = [...new Set<string>([uid, ...followeeIds])];
    where = { kind: "PROJECT50", ...visibilityWhere("friends", uid, followeeIds, ownerIds) };
  } else {
    // Only ACTIVE PUBLIC runs that started within the program window can be
    // currently ranking. The cutoff uses a UTC day key, widened by one extra day
    // (today - N, not today - (N-1)): a runner west of UTC early in the UTC day
    // is still on their local "yesterday", so a genuinely-active Day-50 run can
    // have a startDate one day before a UTC today-(N-1) cutoff. The extra day of
    // slack keeps it in the set; the per-run project50CurrentDay re-check (using
    // each run's own timezone) stays exact and discards any non-rankable extras.
    // ownerId is unrestricted at this stage (any public owner); the aggregate
    // query below re-applies the same PUBLIC filter to the candidate owners.
    const cutoff = addDays(localDayKey(now, "UTC"), -PROJECT50_LENGTH_DAYS);
    where = {
      kind: "PROJECT50",
      visibility: "PUBLIC",
      status: "ACTIVE",
      startDate: { gte: cutoff },
    };
  }

  const challenges = await prisma.challenge.findMany({
    where,
    select: { id: true, ownerId: true, startDate: true, timezone: true, status: true },
    // Stable ordering for deterministic results (the final ranking is computed
    // in memory from currentDay/completedDays).
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });

  if (challenges.length === 0) return [];

  const candidateOwnerIds = [...new Set(challenges.map((c) => c.ownerId))];

  // Pull the candidate owners' PROJECT50 runs the viewer is allowed to see in
  // this scope (NOT all their runs). This lets `completedDays` — the tie-break —
  // count days from a user's prior FAILED/COMPLETED runs too, while applying the
  // SAME visibility rule as the candidate query so hidden progress never leaks
  // (e.g. a PRIVATE prior run never counts on the global board). Bounded by the
  // candidate owner set, so still no per-user N+1.
  const ownerChallenges = await prisma.challenge.findMany({
    where: {
      kind: "PROJECT50",
      ...visibilityWhere(scope, uid, followeeIds, candidateOwnerIds),
    },
    select: { id: true, ownerId: true },
  });
  const ownerByChallengeId = new Map(ownerChallenges.map((c) => [c.id, c.ownerId]));

  // One DayStatus query over every one of those runs. The rows serve double
  // duty: grouped by challenge they give the per-candidate compliance keys, and
  // grouped by owner they give the cross-run completedDays total.
  const dayRows = await prisma.dayStatus.findMany({
    where: { completed: true, challengeId: { in: ownerChallenges.map((c) => c.id) } },
    select: { challengeId: true, dayKey: true },
  });
  const completedKeysByChallenge = new Map<string, string[]>();
  const completedDaysByOwner = new Map<string, number>();
  for (const r of dayRows) {
    const keys = completedKeysByChallenge.get(r.challengeId);
    if (keys) keys.push(r.dayKey);
    else completedKeysByChallenge.set(r.challengeId, [r.dayKey]);
    const owner = ownerByChallengeId.get(r.challengeId);
    if (owner) completedDaysByOwner.set(owner, (completedDaysByOwner.get(owner) ?? 0) + 1);
  }

  // Bulk-fetch the owner profiles (one query).
  const users = await prisma.user.findMany({
    where: { id: { in: candidateOwnerIds } },
    select: { id: true, handle: true, displayName: true, avatarUrl: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // Aggregate per owner: their newest *still-alive* active candidate run's day
  // number. completedDays comes from the cross-run owner total above.
  interface Agg {
    currentDay: number;
    /** startDate of the active run that set currentDay; "" when none yet. */
    activeStart: string;
  }
  const aggByOwner = new Map<string, Agg>();
  for (const c of challenges) {
    const agg = aggByOwner.get(c.ownerId) ?? { currentDay: 0, activeStart: "" };
    // Only an ACTIVE run can contribute a current day, and only if it is still
    // alive under the hard-reset rule. When a user has several active runs, the
    // most recently started living one wins (highest startDate).
    if (c.status === "ACTIVE" && c.startDate > agg.activeStart) {
      const todayKey = localDayKey(now, c.timezone);
      const day = project50CurrentDay({
        startDate: c.startDate,
        todayKey,
        completedDayKeys: completedKeysByChallenge.get(c.id) ?? [],
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
      completedDays: completedDaysByOwner.get(ownerId) ?? 0,
      isMe: ownerId === uid,
    });
  }

  entries.sort(
    (a, b) => b.currentDay - a.currentDay || b.completedDays - a.completedDays,
  );

  return entries.slice(0, TOP_N).map((e, i) => ({ ...e, rank: i + 1 }));
}
