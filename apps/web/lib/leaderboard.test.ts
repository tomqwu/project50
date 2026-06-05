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
 * Wire the challenge + (auto-compliant) dayStatus mocks together. Pass explicit
 * dayStatus rows to override compliance for a specific run.
 */
function setup(challenges: ChallengeRow[], dayStatus?: DayStatusRow[]) {
  mockChallengeFindMany.mockResolvedValue(challenges);
  const rows =
    dayStatus ??
    challenges.flatMap((c) =>
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
      [
        // ua started 06-01 but only completed the first two days → missed days
        // afterward, so the run should have hard-reset (currentDay 0).
        { challengeId: "stale", dayKey: "2026-06-01" },
        { challengeId: "stale", dayKey: "2026-06-02" },
        // ub is fully compliant.
        ...compliantDays("fresh", "2026-06-08"),
      ],
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
    setup(
      [
        challenge("c1", "ua", "2026-06-09", "ACTIVE"), // day 2
        challenge("c2", "ua", "2026-04-01", "FAILED"), // a prior failed run
      ],
      [
        { challengeId: "c1", dayKey: "2026-06-09" }, // 1 completed (active, compliant)
        // 12 completed days from the prior failed run
        ...Array.from({ length: 12 }, (_, i) => ({
          challengeId: "c2",
          dayKey: addUtcDays("2026-04-01", i),
        })),
      ],
    );
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.completedDays).toBe(13);
    expect(rows[0]!.currentDay).toBe(2);
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
    setup(challenges, dayStatus);
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
    // status restricted to ACTIVE and startDate floored to today-49.
    expect(args.where.status).toBe("ACTIVE");
    // 2026-06-10 minus 49 days = 2026-04-22.
    expect(args.where.startDate).toEqual({ gte: "2026-04-22" });
    expect(args.where.visibility).toBe("PUBLIC");
  });

  it("a brand-new active run started today is NOT excluded by older stale runs", async () => {
    // Simulate the DB window filter: the query (gte today-49, ACTIVE) only
    // returns the fresh run; 500+ stale runs started before the window never
    // load. The fresh run must rank.
    setup([challenge("fresh", "ua", TODAY, "ACTIVE")]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ua"]);
    expect(rows[0]!.currentDay).toBe(1);
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

  it("avoids N+1: one challenge query, one dayStatus query, one user query", async () => {
    setup([
      challenge("ca", "ua", "2026-06-08"),
      challenge("cb", "ub", "2026-06-06"),
      challenge("cc", "uc", "2026-06-09"),
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub"), user("uc")]);

    await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(mockChallengeFindMany).toHaveBeenCalledTimes(1);
    expect(mockDayStatusFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
  });
});
