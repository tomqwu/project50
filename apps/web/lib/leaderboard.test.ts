import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- hoisted prisma mock ----
const {
  mockFollowFindMany,
  mockChallengeFindMany,
  mockDayStatusGroupBy,
  mockUserFindMany,
} = vi.hoisted(() => ({
  mockFollowFindMany: vi.fn(),
  mockChallengeFindMany: vi.fn(),
  mockDayStatusGroupBy: vi.fn(),
  mockUserFindMany: vi.fn(),
}));

vi.mock("@project50/db", () => ({
  prisma: {
    follow: { findMany: mockFollowFindMany },
    challenge: { findMany: mockChallengeFindMany },
    dayStatus: { groupBy: mockDayStatusGroupBy },
    user: { findMany: mockUserFindMany },
  },
}));

import { getLeaderboard } from "./leaderboard";

/**
 * Fixed instant used across tests. All run timezones are UTC so the local day
 * key resolves deterministically to 2026-06-10.
 */
const NOW = new Date("2026-06-10T12:00:00.000Z");

type ChallengeRow = {
  id: string;
  ownerId: string;
  startDate: string;
  timezone: string;
  status: "ACTIVE" | "FAILED" | "COMPLETED";
};

type UserRow = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible empty defaults; individual tests override.
  mockFollowFindMany.mockResolvedValue([]);
  mockChallengeFindMany.mockResolvedValue([]);
  mockDayStatusGroupBy.mockResolvedValue([]);
  mockUserFindMany.mockResolvedValue([]);
});

function challenge(
  id: string,
  ownerId: string,
  startDate: string,
  status: ChallengeRow["status"] = "ACTIVE",
  timezone = "UTC",
): ChallengeRow {
  return { id, ownerId, startDate, timezone, status };
}

function user(id: string, handle = id, displayName = id.toUpperCase()): UserRow {
  return { id, handle, displayName, avatarUrl: null };
}

describe("getLeaderboard — scope resolution", () => {
  it("global scope: every user with a PROJECT50 run, sorted by currentDay desc", async () => {
    mockChallengeFindMany.mockResolvedValue([
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
  });

  it("friends scope: followees ∪ self only", async () => {
    mockFollowFindMany.mockResolvedValue([
      { followeeId: "ua" },
      { followeeId: "ub" },
    ]);
    mockChallengeFindMany.mockResolvedValue([
      challenge("cme", "viewer", "2026-06-09"), // day 2
      challenge("ca", "ua", "2026-06-06"), // day 5
      challenge("cb", "ub", "2026-06-08"), // day 3
    ]);
    mockUserFindMany.mockResolvedValue([
      user("viewer"),
      user("ua"),
      user("ub"),
    ]);

    const rows = await getLeaderboard("viewer", { scope: "friends", now: NOW });

    // followers query scoped to viewer
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

  it("friends scope with no follows still includes self", async () => {
    mockFollowFindMany.mockResolvedValue([]);
    mockChallengeFindMany.mockResolvedValue([
      challenge("cme", "viewer", "2026-06-09"),
    ]);
    mockUserFindMany.mockResolvedValue([user("viewer")]);

    const rows = await getLeaderboard("viewer", { scope: "friends", now: NOW });

    const challengeArgs = mockChallengeFindMany.mock.calls[0]![0];
    expect(challengeArgs.where.ownerId.in).toEqual(["viewer"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe("viewer");
    expect(rows[0]!.isMe).toBe(true);
  });
});

describe("getLeaderboard — metric & ranking", () => {
  it("ties on currentDay break by completedDays desc", async () => {
    mockChallengeFindMany.mockResolvedValue([
      challenge("ca", "ua", "2026-06-08"), // day 3
      challenge("cb", "ub", "2026-06-08"), // day 3
    ]);
    mockDayStatusGroupBy.mockResolvedValue([
      { challengeId: "ca", _count: { _all: 2 } },
      { challengeId: "cb", _count: { _all: 9 } },
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ub", "ua"]);
    expect(rows.map((r) => r.completedDays)).toEqual([9, 2]);
  });

  it("clamps currentDay into 1..50 for the active run", async () => {
    mockChallengeFindMany.mockResolvedValue([
      challenge("ca", "ua", "2026-06-10"), // day 1 exactly
      challenge("cb", "ub", "2026-06-11"), // dayNumber 0 → clamp to 1
      challenge("cc", "uc", "2026-01-01"), // far past → clamp to 50
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub"), user("uc")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    const byId = Object.fromEntries(rows.map((r) => [r.userId, r.currentDay]));
    expect(byId.ua).toBe(1);
    expect(byId.ub).toBe(1);
    expect(byId.uc).toBe(50);
  });

  it("currentDay is 0 when the user has no ACTIVE run (only failed/completed)", async () => {
    mockChallengeFindMany.mockResolvedValue([
      challenge("ca", "ua", "2026-06-08", "ACTIVE"), // day 3
      challenge("cb", "ub", "2026-05-01", "COMPLETED"),
      challenge("cc", "uc", "2026-05-20", "FAILED"),
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub"), user("uc")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    const byId = Object.fromEntries(rows.map((r) => [r.userId, r.currentDay]));
    expect(byId.ua).toBe(3);
    expect(byId.ub).toBe(0);
    expect(byId.uc).toBe(0);
    // ua (active, day 3) ranks above the two 0-day users.
    expect(rows[0]!.userId).toBe("ua");
  });

  it("completedDays sums DayStatus.completed across ALL of a user's PROJECT50 runs", async () => {
    mockChallengeFindMany.mockResolvedValue([
      challenge("c1", "ua", "2026-06-09", "ACTIVE"), // day 2
      challenge("c2", "ua", "2026-04-01", "FAILED"), // a prior failed run
    ]);
    mockDayStatusGroupBy.mockResolvedValue([
      { challengeId: "c1", _count: { _all: 1 } },
      { challengeId: "c2", _count: { _all: 12 } },
    ]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.completedDays).toBe(13);
    expect(rows[0]!.currentDay).toBe(2);
  });

  it("prefers the most recently started ACTIVE run when a user has several", async () => {
    mockChallengeFindMany.mockResolvedValue([
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
    mockChallengeFindMany.mockResolvedValue([
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
    mockChallengeFindMany.mockResolvedValue([
      challenge("ca", "ua", "2026-06-08"),
      challenge("ghost", "missing", "2026-06-06"),
    ]);
    // `missing` owns a run but has no user row (e.g. FK lag / deleted profile).
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows.map((r) => r.userId)).toEqual(["ua"]);
  });

  it("returns an empty array when no users have a PROJECT50 run", async () => {
    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });
    expect(rows).toEqual([]);
    // no profile fetch when there are no challenge owners
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("caps the result at the top 50", async () => {
    const challenges: ChallengeRow[] = [];
    const users: UserRow[] = [];
    for (let i = 0; i < 60; i++) {
      const id = `u${String(i).padStart(2, "0")}`;
      // Larger i → earlier startDate → higher currentDay → higher rank.
      const day = i + 1; // 1..60 days elapsed → currentDay clamps but stays distinct enough
      const start = new Date(NOW);
      start.setUTCDate(start.getUTCDate() - i);
      challenges.push(
        challenge(id, id, start.toISOString().slice(0, 10), "ACTIVE"),
      );
      users.push(user(id));
      void day;
    }
    mockChallengeFindMany.mockResolvedValue(challenges);
    mockUserFindMany.mockResolvedValue(users);

    const rows = await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(rows).toHaveLength(50);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[49]!.rank).toBe(50);
  });

  it("defaults `now` to the current time when omitted", async () => {
    mockChallengeFindMany.mockResolvedValue([
      challenge("ca", "ua", "2020-01-01"), // far past → clamps to 50 regardless of real now
    ]);
    mockUserFindMany.mockResolvedValue([user("ua")]);

    const rows = await getLeaderboard("viewer", { scope: "global" });

    expect(rows[0]!.currentDay).toBe(50);
  });

  it("avoids N+1: one challenge query, one groupBy, one user query", async () => {
    mockChallengeFindMany.mockResolvedValue([
      challenge("ca", "ua", "2026-06-08"),
      challenge("cb", "ub", "2026-06-06"),
      challenge("cc", "uc", "2026-06-09"),
    ]);
    mockUserFindMany.mockResolvedValue([user("ua"), user("ub"), user("uc")]);

    await getLeaderboard("viewer", { scope: "global", now: NOW });

    expect(mockChallengeFindMany).toHaveBeenCalledTimes(1);
    expect(mockDayStatusGroupBy).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
  });
});
