import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- hoisted prisma mock ----
const {
  mockFollowFindMany,
  mockChallengeFindMany,
  mockDayStatusFindMany,
  mockUserFindMany,
} = vi.hoisted(() => ({
  mockFollowFindMany: vi.fn(),
  mockChallengeFindMany: vi.fn(),
  mockDayStatusFindMany: vi.fn(),
  mockUserFindMany: vi.fn(),
}));

vi.mock("@project50/db", () => ({
  prisma: {
    follow: { findMany: mockFollowFindMany },
    challenge: { findMany: mockChallengeFindMany },
    dayStatus: { findMany: mockDayStatusFindMany },
    user: { findMany: mockUserFindMany },
  },
}));

import { getLeaderboard } from "./leaderboard";

/**
 * Fixed instant used across tests. All run timezones are UTC so the local day
 * key resolves deterministically to 2026-06-10.
 */
const NOW = new Date("2026-06-10T12:00:00.000Z");
const TODAY = "2026-06-10";

type Visibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";

type ChallengeRow = {
  id: string;
  ownerId: string;
  startDate: string;
  timezone: string;
  status: "ACTIVE" | "FAILED" | "COMPLETED";
  visibility: Visibility;
};

type UserRow = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

type DayStatusRow = { challengeId: string; dayKey: string };

function addUtcDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Compliant completed-day rows for a challenge: every elapsed past day
 * (startDate .. yesterday) marked completed, so project50CurrentDay keeps the
 * run alive. Used so the harness's default runs are "alive" unless a test
 * deliberately omits a day.
 */
function compliantDays(challengeId: string, startDate: string): DayStatusRow[] {
  const rows: DayStatusRow[] = [];
  for (let d = startDate; d < TODAY; d = addUtcDays(d, 1)) {
    rows.push({ challengeId, dayKey: d });
  }
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible empty defaults; individual tests override.
  mockFollowFindMany.mockResolvedValue([]);
  mockChallengeFindMany.mockResolvedValue([]);
  mockDayStatusFindMany.mockResolvedValue([]);
  mockUserFindMany.mockResolvedValue([]);
});

function challenge(
  id: string,
  ownerId: string,
  startDate: string,
  status: ChallengeRow["status"] = "ACTIVE",
  visibility: Visibility = "PUBLIC",
  timezone = "UTC",
): ChallengeRow {
  return { id, ownerId, startDate, timezone, status, visibility };
}

function user(id: string, handle = id, displayName = id.toUpperCase()): UserRow {
  return { id, handle, displayName, avatarUrl: null };
}

/**
 * Wire the challenge + dayStatus mocks together to mirror the implementation's
 * two distinct, ordered `challenge.findMany` calls:
 *   1. the candidate query (global: status ACTIVE + startDate window; friends:
 *      OR visibility clause) — returns `candidates`.
 *   2. the owner-aggregate query (the candidate owners' PROJECT50 runs the
 *      viewer is allowed to see in this scope) — returns `allChallenges`, used
 *      to total `completedDays` across a user's historical runs.
 *
 * `dayStatus` rows feed both the per-candidate compliance check and the
 * cross-run completed-day totals. By default they are auto-derived as compliant
 * days for every challenge passed.
 *
 * The two challenge calls are told apart by ORDER (candidate first, aggregate
 * second) — both now carry visibility filters, so structural discrimination is
 * no longer reliable.
 */
function setup(
  candidates: ChallengeRow[],
  opts?: { dayStatus?: DayStatusRow[]; allChallenges?: ChallengeRow[] },
) {
  const allChallenges = opts?.allChallenges ?? candidates;
  let challengeCall = 0;
  mockChallengeFindMany.mockImplementation(() => {
    const result = challengeCall === 0 ? candidates : allChallenges;
    challengeCall += 1;
    return Promise.resolve(result);
  });
  const everyChallenge = [
    ...allChallenges,
    ...candidates.filter((c) => !allChallenges.some((a) => a.id === c.id)),
  ];
  const rows =
    opts?.dayStatus ??
    everyChallenge.flatMap((c) =>
      c.status === "ACTIVE" ? compliantDays(c.id, c.startDate) : [],
    );
  mockDayStatusFindMany.mockResolvedValue(rows);
}

describe("getLeaderboard — scope resolution & visibility", () => {
  it("global scope: PUBLIC PROJECT50 runs, sorted by currentDay desc", async () => {
    setup([
      challenge("ca", "ua", "2026-06-08"), // day 3
      challenge("cb", "ub", "2026-06-06"), // day 5
      challenge("cc", "uc", "2026-06-09"), // day 2
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub"), user("uc")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ub", "ua", "uc"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.currentDay)).toEqual([5, 3, 2]);
    // global query is NOT filtered to the viewer's follow set.
    expect(mockFollowFindMany).not.toHaveBeenCalled();
    // global query gates visibility to PUBLIC at the DB layer.
    const challengeArgs = mockChallengeFindMany.mock.calls[0]![0];
    expect(challengeArgs.where.visibility).toBe("PUBLIC");
  });

  it("global scope NEVER includes a PRIVATE run", async () => {
    // The DB query filters PUBLIC only; simulate that by returning just the
    // PUBLIC row (Prisma would not return the private one).
    setup([challenge("ca", "ua", "2026-06-08", "ACTIVE", "PUBLIC")]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ua"]);
    // The where clause must restrict to PUBLIC so private rows never load.
    expect(mockChallengeFindMany.mock.calls[0]![0].where.visibility).toBe("PUBLIC");
  });

  it("friends scope: includes PUBLIC and FOLLOWERS runs of followees", async () => {
    mockFollowFindMany.mockResolvedValue([
      { followeeId: "ua" },
      { followeeId: "ub" },
    ]);
    setup([
      challenge("cme", "viewer", "2026-06-09", "ACTIVE", "PRIVATE"), // own, day 2
      challenge("ca", "ua", "2026-06-06", "ACTIVE", "PUBLIC"), // day 5
      challenge("cb", "ub", "2026-06-08", "ACTIVE", "FOLLOWERS"), // day 3
    ]);
    mockUserFindMany.mockResolvedValue([user("viewer"), user("ua"), user("ub")]);

    const rows = await getLeaderboard("viewer", { scope: "friends", now: NOW });

    expect(mockFollowFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { followerId: "viewer" } }),
    );
    // challenge query restricted to the friend id set (self + followees)
    const challengeArgs = mockChallengeFindMany.mock.calls[0]![0];
    expect(challengeArgs.where.ownerId.in.sort()).toEqual(
      ["ua", "ub", "viewer"].sort(),
    );
    expect(rows.map((r) => r.userId)).toEqual(["ua", "ub", "viewer"]);
  });

  it("friends scope: a FOLLOWERS run shows for a follower but is absent from global", async () => {
    mockFollowFindMany.mockResolvedValue([{ followeeId: "ua" }]);
    setup([
      challenge("cme", "viewer", "2026-06-09", "ACTIVE", "PUBLIC"),
      challenge("ca", "ua", "2026-06-06", "ACTIVE", "FOLLOWERS"),
    ]);
    mockUserFindMany.mockResolvedValue([user("viewer"), user("ua")]);

    const friends = await getLeaderboard("viewer", { scope: "friends", now: NOW });
    expect(friends.map((r) => r.userId)).toContain("ua");

    // Global: ua's FOLLOWERS run must NOT appear (DB returns only PUBLIC rows).
    vi.clearAllMocks();
    mockFollowFindMany.mockResolvedValue([]);
    setup([challenge("cme", "viewer", "2026-06-09", "ACTIVE", "PUBLIC")]);
    mockUserFindMany.mockResolvedValue([user("viewer")]);

    const global = await getLeaderboard("viewer", { scope: "global", now: NOW });
    expect(global.map((r) => r.userId)).not.toContain("ua");
  });

  it("friends scope: a viewer-blocked followee is excluded (block exclusion in the query)", async () => {
    mockFollowFindMany.mockResolvedValue([
      { followeeId: "ua" },
      { followeeId: "blocked" }, // still followed, but the viewer blocked them
    ]);
    // The query's owner block filter drops `blocked`'s run; Prisma returns only
    // the non-blocked followee's run (+ none from the blocked user).
    setup([challenge("ca", "ua", "2026-06-06", "ACTIVE", "PUBLIC")]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "friends", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ua"]);
    expect(rows.map((r) => r.userId)).not.toContain("blocked");
    // Both the candidate (call 0) and aggregate (call 1) queries exclude owners
    // the viewer has blocked, mirroring the feed's blocksReceived filter.
    for (const call of [0, 1]) {
      const where = mockChallengeFindMany.mock.calls[call]![0].where;
      expect(where.owner).toEqual({ blocksReceived: { none: { blockerId: "viewer" } } });
    }
  });

  it("global scope: viewer-blocked users are excluded too", async () => {
    setup([challenge("ca", "ua", "2026-06-08", "ACTIVE", "PUBLIC")]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    await getLeaderboard("viewer", { scope: "global", now: NOW });

    const where = mockChallengeFindMany.mock.calls[0]![0].where;
    expect(where.owner).toEqual({ blocksReceived: { none: { blockerId: "viewer" } } });
  });

  it("friends scope: the viewer's OWN PRIVATE run still appears as isMe", async () => {
    mockFollowFindMany.mockResolvedValue([]);
    setup([challenge("cme", "viewer", "2026-06-09", "ACTIVE", "PRIVATE")]);
    mockUserFindMany.mockResolvedValue([user("viewer")]);

    const rows = await getLeaderboard("viewer", { scope: "friends", now: NOW });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe("viewer");
    expect(rows[0]!.isMe).toBe(true);
    // The friends DB filter must allow own-PRIVATE plus followee PUBLIC/FOLLOWERS.
    const where = mockChallengeFindMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).toContain("viewer");
  });

  it("friends scope: a followee's PRIVATE run is excluded", async () => {
    mockFollowFindMany.mockResolvedValue([{ followeeId: "ua" }]);
    // The DB-level OR filter drops ua's PRIVATE run; only the viewer's run loads.
    setup([challenge("cme", "viewer", "2026-06-09", "ACTIVE", "PUBLIC")]);
    mockUserFindMany.mockResolvedValue([user("viewer")]);

    const rows = await getLeaderboard("viewer", { scope: "friends", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["viewer"]);
  });

  it("friends scope with no follows still includes self", async () => {
    mockFollowFindMany.mockResolvedValue([]);
    setup([challenge("cme", "viewer", "2026-06-09")]);
    mockUserFindMany.mockResolvedValue([user("viewer")]);

    const rows = await getLeaderboard("viewer", { scope: "friends", now: NOW });

    const challengeArgs = mockChallengeFindMany.mock.calls[0]![0];
    expect(challengeArgs.where.ownerId.in).toEqual(["viewer"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe("viewer");
  });
});

describe("getLeaderboard — metric & ranking", () => {
  it("ties on currentDay break by completedDays desc", async () => {
    setup([
      challenge("ca", "ua", "2026-06-08"), // day 3 → 2 compliant past days
      challenge("cb", "ub", "2026-06-08"), // day 3 → 2 compliant past days
    ]);
    // Override ub's completed days to be higher (extra completed today).
    mockDayStatusFindMany.mockResolvedValue([
      ...compliantDays("ca", "2026-06-08"),
      ...compliantDays("cb", "2026-06-08"),
      { challengeId: "cb", dayKey: TODAY }, // ub also completed today → 3 total
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ub", "ua"]);
    expect(rows.map((r) => r.completedDays)).toEqual([3, 2]);
  });

  it("clamps currentDay into 1..50 for a compliant active run", async () => {
    setup([
      challenge("ca", "ua", "2026-06-10"), // day 1 exactly
      challenge("cb", "ub", "2026-06-11"), // dayNumber 0 → not started → 0
      challenge("cc", "uc", "2026-01-01"), // far past, compliant → clamp to 50
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub"), user("uc")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    const byId = Object.fromEntries(rows.map((r) => [r.userId, r.currentDay]));
    expect(byId.ua).toBe(1);
    expect(byId.ub).toBe(0); // start in the future → not active
    expect(byId.uc).toBe(50);
  });

  it("a run that missed an elapsed day does NOT outrank a compliant run", async () => {
    setup(
      [
        challenge("stale", "ua", "2026-06-01"), // would be day 10
        challenge("fresh", "ub", "2026-06-08"), // day 3, compliant
      ],
      {
        dayStatus: [
          // ua started 06-01 but only completed the first two days → missed
          // days afterward, so the run should have hard-reset (currentDay 0).
          { challengeId: "stale", dayKey: "2026-06-01" },
          { challengeId: "stale", dayKey: "2026-06-02" },
          // ub is fully compliant.
          ...compliantDays("fresh", "2026-06-08"),
        ],
      },
    );
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    const byId = Object.fromEntries(rows.map((r) => [r.userId, r.currentDay]));
    expect(byId.ua).toBe(0); // stale/failed-but-not-flipped run is not active
    expect(byId.ub).toBe(3);
    expect(rows[0]!.userId).toBe("ub"); // the compliant run ranks first
  });

  it("currentDay is 0 when the user has no ACTIVE run (only failed/completed)", async () => {
    setup([
      challenge("ca", "ua", "2026-06-08", "ACTIVE"), // day 3, compliant
      challenge("cb", "ub", "2026-05-01", "COMPLETED"),
      challenge("cc", "uc", "2026-05-20", "FAILED"),
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub"), user("uc")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    const byId = Object.fromEntries(rows.map((r) => [r.userId, r.currentDay]));
    expect(byId.ua).toBe(3);
    expect(byId.ub).toBe(0);
    expect(byId.uc).toBe(0);
    expect(rows[0]!.userId).toBe("ua");
  });

  it("completedDays sums DayStatus.completed across ALL of a user's PROJECT50 runs", async () => {
    // The active run c1 is the only global candidate; the prior FAILED run c2 is
    // NOT a candidate (status filter) but must still contribute its completed
    // days to the tie-break total — so it lives in the owner-aggregate set.
    setup(
      [challenge("c1", "ua", "2026-06-09", "ACTIVE")], // day 2 candidate
      {
        allChallenges: [
          challenge("c1", "ua", "2026-06-09", "ACTIVE"),
          challenge("c2", "ua", "2026-04-01", "FAILED"), // prior failed run
        ],
        dayStatus: [
          { challengeId: "c1", dayKey: "2026-06-09" }, // 1 completed (active, compliant)
          // 12 completed days from the prior failed run
          ...Array.from({ length: 12 }, (_, i) => ({
            challengeId: "c2",
            dayKey: addUtcDays("2026-04-01", i),
          })),
        ],
      },
    );
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.completedDays).toBe(13);
    expect(rows[0]!.currentDay).toBe(2);
  });

  it("global completedDays does NOT leak a user's PRIVATE prior run (visibility-gated aggregate)", async () => {
    // c1 active PUBLIC (the candidate). c2 is a prior PRIVATE completed run —
    // the visibility-gated aggregate query must NOT return it, so its days don't
    // inflate completedDays on the public board.
    setup(
      [challenge("c1", "ua", "2026-06-09", "ACTIVE", "PUBLIC")], // day 2
      {
        // The aggregate query is visibility-filtered, so only the PUBLIC run is
        // returned (c2 PRIVATE is dropped by the DB filter).
        allChallenges: [challenge("c1", "ua", "2026-06-09", "ACTIVE", "PUBLIC")],
        dayStatus: [{ challengeId: "c1", dayKey: "2026-06-09" }],
      },
    );
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows[0]!.completedDays).toBe(1); // only the public run's day
    // The aggregate (2nd) challenge query gates visibility to PUBLIC.
    const aggArgs = mockChallengeFindMany.mock.calls[1]![0];
    expect(aggArgs.where.visibility).toBe("PUBLIC");
    expect(aggArgs.where.ownerId).toEqual({ in: ["ua"] });
  });

  it("friends completedDays gates the aggregate with the same OR visibility rule", async () => {
    mockFollowFindMany.mockResolvedValue([{ followeeId: "fr" }]);
    setup(
      [
        challenge("me-active", "viewer", "2026-06-09", "ACTIVE", "PRIVATE"),
        challenge("fr-active", "fr", "2026-06-09", "ACTIVE", "FOLLOWERS"),
      ],
      {
        // Aggregate the viewer is allowed to see: own runs (any visibility) +
        // followee PUBLIC/FOLLOWERS. A followee PRIVATE run is excluded.
        allChallenges: [
          challenge("me-active", "viewer", "2026-06-09", "ACTIVE", "PRIVATE"),
          challenge("me-old", "viewer", "2026-01-01", "COMPLETED", "PRIVATE"),
          challenge("fr-active", "fr", "2026-06-09", "ACTIVE", "FOLLOWERS"),
        ],
        dayStatus: [
          { challengeId: "me-active", dayKey: "2026-06-09" },
          ...Array.from({ length: 50 }, (_, i) => ({
            challengeId: "me-old",
            dayKey: addUtcDays("2026-01-01", i),
          })),
          { challengeId: "fr-active", dayKey: "2026-06-09" },
        ],
      },
    );
    mockUserFindMany.mockResolvedValue([user("viewer"), user("fr")]);

    const rows = await getLeaderboard("viewer", { scope: "friends", now: NOW });

    // The aggregate (2nd) challenge query uses the OR visibility rule.
    const aggArgs = mockChallengeFindMany.mock.calls[1]![0];
    expect(aggArgs.where.OR).toEqual([
      { ownerId: "viewer" },
      { ownerId: { in: ["fr"] }, visibility: { in: ["PUBLIC", "FOLLOWERS"] } },
    ]);
    expect(aggArgs.where.ownerId).toEqual({ in: ["viewer", "fr"] });

    // Own PRIVATE historical run counts for the viewer (51 = 1 active + 50 old).
    const me = rows.find((r) => r.userId === "viewer")!;
    expect(me.completedDays).toBe(51);
    // The followee's visible FOLLOWERS run counts (1).
    const fr = rows.find((r) => r.userId === "fr")!;
    expect(fr.completedDays).toBe(1);
  });

  it("prefers the most recently started ACTIVE run when a user has several", async () => {
    setup([
      challenge("old", "ua", "2026-05-01", "ACTIVE"), // day 41
      challenge("new", "ua", "2026-06-08", "ACTIVE"), // day 3
    ]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows[0]!.currentDay).toBe(3);
  });
});

describe("getLeaderboard — projection & limits", () => {
  it("projects handle/displayName/avatarUrl/isMe and uses null avatar passthrough", async () => {
    setup([
      challenge("ca", "viewer", "2026-06-08"),
      challenge("cb", "ub", "2026-06-06"),
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "viewer", handle: "me", displayName: "Me Myself", avatarUrl: null },
      { id: "ub", handle: "bob", displayName: "Bob", avatarUrl: "https://a/b.png" },
    ]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    const me = rows.find((r) => r.userId === "viewer")!;
    expect(me).toMatchObject({
      handle: "me",
      displayName: "Me Myself",
      avatarUrl: null,
      isMe: true,
    });
    const bob = rows.find((r) => r.userId === "ub")!;
    expect(bob.avatarUrl).toBe("https://a/b.png");
    expect(bob.isMe).toBe(false);
  });

  it("skips a challenge owner with no matching user profile row", async () => {
    setup([
      challenge("ca", "ua", "2026-06-08"),
      challenge("ghost", "missing", "2026-06-06"),
    ]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ua"]);
  });

  it("returns an empty array when no users have a PROJECT50 run", async () => {
    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });
    expect(rows).toEqual([]);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("caps the result at the top 50", async () => {
    const challenges: ChallengeRow[] = [];
    const users: UserRow[] = [];
    const dayStatus: DayStatusRow[] = [];
    for (let i = 0; i < 60; i++) {
      const id = `u${String(i).padStart(2, "0")}`;
      const start = addUtcDays(TODAY, -i); // larger i → earlier start → higher day
      challenges.push(challenge(id, id, start, "ACTIVE"));
      users.push(user(id));
      dayStatus.push(...compliantDays(id, start));
    }
    setup(challenges, { dayStatus });
    mockUserFindMany.mockResolvedValue(users);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows).toHaveLength(50);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[49]!.rank).toBe(50);
  });

  it("bounds the global candidate query by a 50-day startDate window + ACTIVE, not a blind row cap", async () => {
    setup([challenge("ca", "ua", "2026-06-01")]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    await getLeaderboard("viewer", { scope: "global", now: NOW });

    const args = mockChallengeFindMany.mock.calls[0]![0];
    // No blind take cap — the window bounds the set instead.
    expect(args.take).toBeUndefined();
    // status restricted to ACTIVE and startDate floored to today-50 (one extra
    // day of westward-timezone slack beyond the 50-day program length).
    expect(args.where.status).toBe("ACTIVE");
    // 2026-06-10 minus 50 days = 2026-04-21.
    expect(args.where.startDate).toEqual({ gte: "2026-04-21" });
    expect(args.where.visibility).toBe("PUBLIC");
  });

  it("a brand-new active run started today is NOT excluded by older stale runs", async () => {
    // Simulate the DB window filter: the query (gte today-50, ACTIVE) only
    // returns the fresh run; 500+ stale runs started before the window never
    // load. The fresh run must rank.
    setup([challenge("fresh", "ua", TODAY, "ACTIVE")]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ua"]);
    expect(rows[0]!.currentDay).toBe(1);
  });

  it("includes a Day-50 run for a westward-TZ user early in the UTC day (cutoff slack)", async () => {
    // LA at 2026-06-10T02:00Z is still 2026-06-09 local. A run started 49 LOCAL
    // days earlier (2026-04-21, America/Los_Angeles) is on Day 50 locally, but
    // its startDate is one day before the OLD today-49 UTC cutoff (2026-04-22),
    // so it would have been dropped. The widened today-50 cutoff (2026-04-21)
    // keeps it in the candidate set; the per-run check then confirms Day 50.
    const earlyUtc = new Date("2026-06-10T02:00:00.000Z");
    const startLocal = "2026-04-21"; // Day 50 on 2026-06-09 local (LA)
    // Compliant: local days 1..49 (2026-04-21 .. 2026-06-08) all completed.
    const days: DayStatusRow[] = [];
    for (let d = startLocal; d < "2026-06-09"; d = addUtcDays(d, 1)) {
      days.push({ challengeId: "la", dayKey: d });
    }
    setup([challenge("la", "ua", startLocal, "ACTIVE", "PUBLIC", "America/Los_Angeles")], {
      dayStatus: days,
    });
    mockUserFindMany.mockResolvedValue([user("ua")]);

    await getLeaderboard("viewer", { scope: "global", now: earlyUtc });

    // The widened cutoff must be <= the run's startDate so the DB query keeps it,
    // and strictly earlier than the old today-49 cutoff would have been.
    const args = mockChallengeFindMany.mock.calls[0]![0];
    expect(args.where.startDate.gte <= startLocal).toBe(true);
    expect(args.where.startDate.gte).toBe("2026-04-21");

    // With the run returned, the per-run timezone check ranks it as Day 50.
    const rows = await getLeaderboard("viewer", { scope: "global", now: earlyUtc });
    expect(rows[0]!.userId).toBe("ua");
    expect(rows[0]!.currentDay).toBe(50);
  });

  it("two users tied on currentDay: the one with a prior completed run ranks higher", async () => {
    // ua and ub are both on Day 3 in their active runs. ua has a prior COMPLETED
    // run (50 done days) that is NOT a global candidate but must still count
    // toward the completedDays tie-break, lifting ua above ub.
    setup(
      [
        challenge("ua-active", "ua", "2026-06-08", "ACTIVE"), // day 3
        challenge("ub-active", "ub", "2026-06-08", "ACTIVE"), // day 3
      ],
      {
        allChallenges: [
          challenge("ua-active", "ua", "2026-06-08", "ACTIVE"),
          challenge("ua-done", "ua", "2026-01-01", "COMPLETED"), // prior win
          challenge("ub-active", "ub", "2026-06-08", "ACTIVE"),
        ],
        dayStatus: [
          ...compliantDays("ua-active", "2026-06-08"), // 2 active days
          ...compliantDays("ub-active", "2026-06-08"), // 2 active days
          // ua's prior completed run: 50 completed days.
          ...Array.from({ length: 50 }, (_, i) => ({
            challengeId: "ua-done",
            dayKey: addUtcDays("2026-01-01", i),
          })),
        ],
      },
    );
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ua", "ub"]);
    expect(rows[0]!.currentDay).toBe(3);
    expect(rows[0]!.completedDays).toBe(52); // 2 active + 50 prior
    expect(rows[1]!.completedDays).toBe(2);
  });

  it("the friends scope is not startDate-window bounded (own/older runs still load)", async () => {
    mockFollowFindMany.mockResolvedValue([]);
    setup([challenge("cme", "viewer", "2026-06-09", "ACTIVE", "PRIVATE")]);
    mockUserFindMany.mockResolvedValue([user("viewer")]);

    await getLeaderboard("viewer", { scope: "friends", now: NOW });

    const args = mockChallengeFindMany.mock.calls[0]![0];
    expect(args.where.startDate).toBeUndefined();
    expect(args.where.status).toBeUndefined();
    expect(args.take).toBeUndefined();
  });

  it("defaults `now` to the current time when omitted", async () => {
    // friends scope avoids the global window filter so the assertion is purely
    // about `now` defaulting; a recent compliant run reports its day number.
    mockFollowFindMany.mockResolvedValue([]);
    const today = new Date().toISOString().slice(0, 10);
    setup([challenge("cme", "viewer", today, "ACTIVE")]);
    mockUserFindMany.mockResolvedValue([user("viewer")]);

    const rows = await getLeaderboard("viewer", { scope: "friends" });

    expect(rows[0]!.currentDay).toBe(1);
  });

  it("avoids N+1: bounded query count regardless of owner count", async () => {
    setup([
      challenge("ca", "ua", "2026-06-08"),
      challenge("cb", "ub", "2026-06-06"),
      challenge("cc", "uc", "2026-06-09"),
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub"), user("uc")]);

    await getLeaderboard("viewer", { scope: "global", now: NOW });

    // Two challenge queries (candidates + owner-aggregate), one dayStatus, one
    // user — all bounded by the candidate owners, never per-user N+1.
    expect(mockChallengeFindMany).toHaveBeenCalledTimes(2);
    expect(mockDayStatusFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
  });
});
