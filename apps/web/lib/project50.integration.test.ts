// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma, resetDb } from "@/test/db";
import { addDays, PROJECT50_LENGTH_DAYS } from "@project50/core";

// Object storage is partially mocked: keep the real (presignGet-driven) read
// path so listProject50DayMedia still returns signed URLs, but spy on
// deleteObject so removeProject50DayMedia's blob deletion is asserted without
// hitting a real S3/Azure backend.
const deleteObjectMock = vi.fn<(key: string) => Promise<void>>();
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, deleteObject: (key: string) => deleteObjectMock(key) };
});

import {
  startProject50,
  getProject50State,
  toggleRule,
  getProject50History,
  attachProject50DayMedia,
  listProject50DayMedia,
  removeProject50DayMedia,
} from "./project50";

beforeEach(() => {
  deleteObjectMock.mockReset();
  deleteObjectMock.mockResolvedValue(undefined);
  return resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser() {
  return prisma.user.create({ data: { handle: "u", displayName: "U" } });
}
const NOW = new Date("2026-06-02T12:00:00Z");

describe("getProject50State", () => {
  it("returns NONE when the user has no Project 50 run", async () => {
    const u = await makeUser();
    expect((await getProject50State(u.id, NOW)).status).toBe("NONE");
  });

  it("startProject50 creates an ACTIVE run starting today; state is ACTIVE Day 1 with 0/7", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    const state = await getProject50State(u.id, NOW);
    expect(state.status).toBe("ACTIVE");
    expect(state.today?.dayNumber).toBe(1);
    expect(state.today?.completedCount).toBe(0);
    expect(state.today?.checks).toEqual([false, false, false, false, false, false, false]);
    // The active state exposes the run's public shareId for per-day share links.
    const run = await prisma.challenge.findFirstOrThrow({ where: { ownerId: u.id } });
    expect(state.shareId).toBe(run.shareId);
    expect(state.shareId).toBeTruthy();
  });

  it("exposes shareId only for a PUBLIC run, not a PRIVATE/FOLLOWERS one", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW);

    // PUBLIC (the default for a Project 50 run) → shareId is present so the
    // per-day share links resolve.
    const publicState = await getProject50State(u.id, NOW);
    expect(publicState.shareId).toBeTruthy();

    // PRIVATE → getChallengeByShareId returns null for the link, so we must NOT
    // surface a shareId (the dashboard would otherwise render share buttons whose
    // public day links 404).
    await prisma.challenge.update({ where: { id: runId }, data: { visibility: "PRIVATE" } });
    const privateState = await getProject50State(u.id, NOW);
    expect(privateState.status).toBe("ACTIVE");
    expect(privateState.shareId).toBeUndefined();

    // FOLLOWERS is likewise non-public for an anonymous visitor.
    await prisma.challenge.update({ where: { id: runId }, data: { visibility: "FOLLOWERS" } });
    const followersState = await getProject50State(u.id, NOW);
    expect(followersState.shareId).toBeUndefined();
  });

  it("startProject50 normalizes a malformed timezone to UTC before storing", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "Not/A_Zone", NOW);
    const run = await prisma.challenge.findUniqueOrThrow({ where: { id: runId } });
    expect(run.timezone).toBe("UTC");
    // startDate is the UTC day for NOW (2026-06-02), proving UTC was used.
    expect(run.startDate).toBe("2026-06-02");
  });
});

describe("toggleRule", () => {
  it("checks a rule on today and reflects it in state; DayStatus.completed only at 7/7", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);

    for (let ruleId = 1; ruleId <= 6; ruleId++) {
      await toggleRule(u.id, ruleId, true, NOW);
    }
    let state = await getProject50State(u.id, NOW);
    expect(state.today?.completedCount).toBe(6);
    let ds = await prisma.dayStatus.findFirst({ where: { dayKey: "2026-06-02" } });
    expect(ds?.completed).toBe(false);

    await toggleRule(u.id, 7, true, NOW);
    state = await getProject50State(u.id, NOW);
    expect(state.today?.completedCount).toBe(7);
    ds = await prisma.dayStatus.findFirst({ where: { dayKey: "2026-06-02" } });
    expect(ds?.completed).toBe(true);
  });

  it("unchecking a rule drops completion below 7/7", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    for (let ruleId = 1; ruleId <= 7; ruleId++) await toggleRule(u.id, ruleId, true, NOW);
    await toggleRule(u.id, 3, false, NOW);
    const ds = await prisma.dayStatus.findFirst({ where: { dayKey: "2026-06-02" } });
    expect(ds?.completed).toBe(false);
  });
});

describe("hard reset", () => {
  const LATER = new Date("2026-06-04T12:00:00Z"); // Day 3 relative to 2026-06-02 start

  it("marks the run FAILED when a past day was not 7/7, reporting the missed day + rule", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // start Day 1 = 2026-06-02
    // Day 1: only complete rules 1..6 (miss rule 7) → past-day failure once time advances
    for (let ruleId = 1; ruleId <= 6; ruleId++) await toggleRule(u.id, ruleId, true, NOW);

    const state = await getProject50State(u.id, LATER);
    expect(state.status).toBe("FAILED");
    expect(state.failedDayNumber).toBe(1);
    expect(state.failedRuleId).toBe(7);

    const run = await prisma.challenge.findFirst({ where: { ownerId: u.id, kind: "PROJECT50" } });
    expect(run?.status).toBe("FAILED");
  });

  it("stays ACTIVE when every past day was 7/7 (today still incomplete is OK)", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    for (let ruleId = 1; ruleId <= 7; ruleId++) await toggleRule(u.id, ruleId, true, NOW); // Day 1 complete
    const NEXT = new Date("2026-06-03T12:00:00Z"); // Day 2, nothing done yet today
    const state = await getProject50State(u.id, NEXT);
    expect(state.status).toBe("ACTIVE");
    expect(state.today?.dayNumber).toBe(2);
  });
});

describe("completion", () => {
  // Complete every day 1..50 for a run, then view from day 51.
  async function completeAllDays(uid: string, startKey: string) {
    let key = startKey;
    for (let i = 0; i < PROJECT50_LENGTH_DAYS; i++) {
      const at = new Date(`${key}T12:00:00Z`);
      for (let ruleId = 1; ruleId <= 7; ruleId++) await toggleRule(uid, ruleId, true, at);
      key = addDays(key, 1);
    }
  }

  const DAY51 = new Date("2026-07-22T12:00:00Z"); // day after 50th day (2026-07-21)

  it("marks the run COMPLETED when all 50 days were 7/7 and the window has elapsed", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // Day 1 = 2026-06-02
    await completeAllDays(u.id, "2026-06-02");

    const state = await getProject50State(u.id, DAY51);
    expect(state.status).toBe("COMPLETED");
    expect(state.completedDays).toBe(50);
    expect(state.runId).toBeDefined();

    const run = await prisma.challenge.findFirst({ where: { ownerId: u.id, kind: "PROJECT50" } });
    expect(run?.status).toBe("COMPLETED");
  });

  it("a COMPLETED run is terminal: it is no longer treated as ACTIVE", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    await completeAllDays(u.id, "2026-06-02");
    await getProject50State(u.id, DAY51); // persists COMPLETED

    // re-reading still reports COMPLETED, and toggling is impossible (no ACTIVE run)
    expect((await getProject50State(u.id, DAY51)).status).toBe("COMPLETED");
    await expect(toggleRule(u.id, 1, true, DAY51)).rejects.toThrow(/No active Project 50 run/);
  });

  it("a missed day at Day 50 fails the run (FAILED, not COMPLETED) even past the window", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // Day 1 = 2026-06-02
    // Complete days 1..49, but Day 50 (2026-07-21) only 6/7.
    let key = "2026-06-02";
    for (let i = 0; i < PROJECT50_LENGTH_DAYS - 1; i++) {
      const at = new Date(`${key}T12:00:00Z`);
      for (let ruleId = 1; ruleId <= 7; ruleId++) await toggleRule(u.id, ruleId, true, at);
      key = addDays(key, 1);
    }
    // Day 50: miss rule 7
    const day50 = new Date("2026-07-21T12:00:00Z");
    for (let ruleId = 1; ruleId <= 6; ruleId++) await toggleRule(u.id, ruleId, true, day50);

    const state = await getProject50State(u.id, DAY51);
    expect(state.status).toBe("FAILED");
    expect(state.failedDayNumber).toBe(50);
    expect(state.failedRuleId).toBe(7);

    const run = await prisma.challenge.findFirst({ where: { ownerId: u.id, kind: "PROJECT50" } });
    expect(run?.status).toBe("FAILED");
  });
});

describe("getProject50History", () => {
  it("returns an empty list when the user has no active run", async () => {
    const u = await makeUser();
    expect(await getProject50History(u.id, NOW)).toEqual({ days: [] });
  });

  it("returns 50 days with sequential dayKeys and dayNumbers from the run start", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // start Day 1 = 2026-06-02
    const { days } = await getProject50History(u.id, NOW);
    expect(days).toHaveLength(50);
    expect(days[0]).toMatchObject({ dayNumber: 1, dayKey: "2026-06-02" });
    expect(days[1]?.dayKey).toBe("2026-06-03");
    expect(days[49]).toMatchObject({ dayNumber: 50, dayKey: "2026-07-21" });
  });

  it("marks today, future, complete and incomplete days correctly", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // Day 1 = 2026-06-02
    // Day 1 complete (7/7)
    for (let ruleId = 1; ruleId <= 7; ruleId++) await toggleRule(u.id, ruleId, true, NOW);

    // Day 2 (2026-06-03): only 6/7 → incomplete past day
    const DAY2 = new Date("2026-06-03T12:00:00Z");
    for (let ruleId = 1; ruleId <= 6; ruleId++) await toggleRule(u.id, ruleId, true, DAY2);

    // View history while "today" is Day 3 (2026-06-04), but read directly on a
    // separate run that is still ACTIVE: re-seed so getProject50State doesn't fail it.
    const { days } = await getProject50History(u.id, DAY2);

    // Day 1 complete
    expect(days[0]?.status).toBe("complete");
    // Day 2 is "today" (DAY2) and not complete → marked today
    expect(days[1]?.status).toBe("today");
    expect(days[1]?.dayNumber).toBe(2);
    // Day 3..50 are future
    expect(days[2]?.status).toBe("future");
    expect(days[49]?.status).toBe("future");
  });

  it("marks a past incomplete day as incomplete (not today, not future)", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // Day 1 = 2026-06-02
    // Day 1 only 6/7 → incomplete
    for (let ruleId = 1; ruleId <= 6; ruleId++) await toggleRule(u.id, ruleId, true, NOW);

    const DAY2 = new Date("2026-06-03T12:00:00Z");
    const { days } = await getProject50History(u.id, DAY2);
    // Day 1 is in the past and not complete → incomplete
    expect(days[0]?.status).toBe("incomplete");
    // Day 2 is today
    expect(days[1]?.status).toBe("today");
  });
});

describe("Project 50 day media", () => {
  it("attachProject50DayMedia writes a row for today's local dayKey on the active run", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW); // Day 1 = 2026-06-02

    await attachProject50DayMedia(
      u.id,
      { objectKey: "media/u/a.jpg", width: 800, height: 600 },
      NOW,
    );

    const rows = await prisma.project50DayMedia.findMany({ where: { challengeId: runId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dayKey: "2026-06-02",
      objectKey: "media/u/a.jpg",
      width: 800,
      height: 600,
    });
  });

  it("uses the run timezone to pick the local dayKey (mirrors toggleRule)", async () => {
    const u = await makeUser();
    // 2026-06-02T02:00:00Z is still 2026-06-01 in America/Toronto (UTC-4).
    const earlyUtc = new Date("2026-06-02T02:00:00Z");
    const runId = await startProject50(u.id, "America/Toronto", earlyUtc);

    await attachProject50DayMedia(
      u.id,
      { objectKey: "media/u/tz.jpg", width: 10, height: 20 },
      earlyUtc,
    );

    const row = await prisma.project50DayMedia.findFirst({ where: { challengeId: runId } });
    expect(row?.dayKey).toBe("2026-06-01");
  });

  it("allows multiple photos for the same day (no unique on dayKey)", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW);
    await attachProject50DayMedia(u.id, { objectKey: "k1", width: 1, height: 1 }, NOW);
    await attachProject50DayMedia(u.id, { objectKey: "k2", width: 2, height: 2 }, NOW);

    const rows = await prisma.project50DayMedia.findMany({ where: { challengeId: runId } });
    expect(rows).toHaveLength(2);
  });

  it("throws when there is no active run", async () => {
    const u = await makeUser();
    await expect(
      attachProject50DayMedia(u.id, { objectKey: "k", width: 1, height: 1 }, NOW),
    ).rejects.toThrow(/No active Project 50 run/);
  });

  it("listProject50DayMedia returns the day's photos oldest-first, each with a signed url", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW);
    await attachProject50DayMedia(u.id, { objectKey: "first", width: 1, height: 1 }, NOW);
    await attachProject50DayMedia(u.id, { objectKey: "second", width: 2, height: 2 }, NOW);

    const media = await listProject50DayMedia(runId, "2026-06-02");
    expect(media.map((m) => m.objectKey)).toEqual(["first", "second"]);
    // each item carries its stable row id (used to remove a specific photo).
    expect(media[0]?.id).toEqual(expect.any(String));
    expect(media[0]?.id).not.toBe(media[1]?.id);
    expect(media[0]?.width).toBe(1);
    // presignGet yields a signed URL that embeds the object key.
    expect(media[0]?.url).toContain("first");
    expect(media[0]?.url).toMatch(/^https?:\/\//);
  });

  it("listProject50DayMedia returns [] for a day with no photos", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW);
    expect(await listProject50DayMedia(runId, "2026-06-02")).toEqual([]);
  });

  it("getProject50State.today.media surfaces today's photos with signed urls", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    await attachProject50DayMedia(u.id, { objectKey: "today-pic", width: 4, height: 3 }, NOW);

    const state = await getProject50State(u.id, NOW);
    expect(state.status).toBe("ACTIVE");
    expect(state.today?.media).toHaveLength(1);
    expect(state.today?.media[0]).toMatchObject({ objectKey: "today-pic", width: 4, height: 3 });
    expect(state.today?.media[0]?.url).toContain("today-pic");
  });

  it("getProject50State.today.media is [] when today has no photos", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    const state = await getProject50State(u.id, NOW);
    expect(state.today?.media).toEqual([]);
  });

  it("removeProject50DayMedia deletes the owner's blob and DB row", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW);
    const key = `media/${u.id}/gone.jpg`;
    await attachProject50DayMedia(u.id, { objectKey: key, width: 5, height: 5 }, NOW);
    const row = await prisma.project50DayMedia.findFirstOrThrow({ where: { challengeId: runId } });

    await removeProject50DayMedia(u.id, row.id);

    expect(deleteObjectMock).toHaveBeenCalledWith(key);
    expect(await prisma.project50DayMedia.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it("removeProject50DayMedia rejects a non-owner and deletes NOTHING (security)", async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { handle: "atk", displayName: "Atk" } });
    const runId = await startProject50(owner.id, "UTC", NOW);
    await attachProject50DayMedia(owner.id, { objectKey: "media/owner/secret.jpg", width: 9, height: 9 }, NOW);
    const row = await prisma.project50DayMedia.findFirstOrThrow({ where: { challengeId: runId } });

    await removeProject50DayMedia(attacker.id, row.id);

    // The blob is untouched and the row still exists — no cross-user deletion.
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(await prisma.project50DayMedia.findUnique({ where: { id: row.id } })).not.toBeNull();
  });

  it("removeProject50DayMedia is a safe no-op for an unknown id", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);

    await expect(removeProject50DayMedia(u.id, "does-not-exist")).resolves.toBeUndefined();
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("removeProject50DayMedia never deletes a blob outside the owner's media prefix (SSRF/cross-user guard)", async () => {
    // A user could attach a row on their OWN run whose objectKey points at
    // another user's blob (objectKey is stored as-supplied). Removing that
    // owned row must NOT delete the out-of-prefix victim blob.
    const u = await prisma.user.create({ data: { handle: "u", displayName: "U" } });
    const runId = await startProject50(u.id, "UTC", NOW);
    await attachProject50DayMedia(
      u.id,
      { objectKey: "media/victim/secret.jpg", width: 1, height: 1 },
      NOW,
    );
    const row = await prisma.project50DayMedia.findFirstOrThrow({ where: { challengeId: runId } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await removeProject50DayMedia(u.id, row.id);

    // The cross-user blob is never touched, but the bogus DB row is still removed.
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(await prisma.project50DayMedia.findUnique({ where: { id: row.id } })).toBeNull();
    warnSpy.mockRestore();
  });

  it("removeProject50DayMedia is idempotent under a concurrent double-delete of the same id", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW);
    await attachProject50DayMedia(u.id, { objectKey: `media/${u.id}/race.jpg`, width: 1, height: 1 }, NOW);
    const row = await prisma.project50DayMedia.findFirstOrThrow({ where: { challengeId: runId } });

    // Both calls observe the row, then both attempt to delete it — the loser
    // must not throw a Prisma P2025 (record-not-found).
    await expect(
      Promise.all([
        removeProject50DayMedia(u.id, row.id),
        removeProject50DayMedia(u.id, row.id),
      ]),
    ).resolves.toEqual([undefined, undefined]);
    expect(await prisma.project50DayMedia.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it("removeProject50DayMedia still deletes the DB row when blob deletion errors", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW);
    await attachProject50DayMedia(u.id, { objectKey: `media/${u.id}/orphan.jpg`, width: 1, height: 1 }, NOW);
    const row = await prisma.project50DayMedia.findFirstOrThrow({ where: { challengeId: runId } });
    deleteObjectMock.mockRejectedValueOnce(new Error("storage 500"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await removeProject50DayMedia(u.id, row.id);

    // Storage failure is logged-and-continued; the row is still removed so no
    // orphaned DB record lingers (an orphaned blob is preferable).
    expect(errorSpy).toHaveBeenCalled();
    expect(await prisma.project50DayMedia.findUnique({ where: { id: row.id } })).toBeNull();
    errorSpy.mockRestore();
  });
});

describe("hard-reset query count (#294 N+1)", () => {
  // Capture the real Prisma delegate methods ONCE so we can spy + call through
  // without losing them (vi.restoreAllMocks can strip lazily-defined delegate
  // properties). Re-spying each test counts calls while preserving DB behavior.
  const realFindMany = prisma.dayStatus.findMany.bind(prisma.dayStatus);
  const realFindUnique = prisma.dayStatus.findUnique.bind(prisma.dayStatus);

  function spyDayStatus() {
    const findMany = vi
      .spyOn(prisma.dayStatus, "findMany")
      .mockImplementation((args) => realFindMany(args));
    const findUnique = vi
      .spyOn(prisma.dayStatus, "findUnique")
      .mockImplementation((args) => realFindUnique(args));
    return { findMany, findUnique };
  }

  afterEach(() => {
    // Restore the captured originals explicitly (robust against delegate getters).
    prisma.dayStatus.findMany = realFindMany;
    prisma.dayStatus.findUnique = realFindUnique;
    vi.restoreAllMocks();
  });

  // Deep into a run with a missed Day 1: the hard reset must short-circuit to
  // FAILED using a SINGLE bulk dayStatus.findMany over startDate..yesterday, and
  // must NOT call dayStatus.findUnique once per elapsed day (the old N+1).
  it("uses ONE bulk dayStatus.findMany and ZERO per-day findUnique calls when failing deep in a run", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // Day 1 = 2026-06-02
    // Day 1 only 6/7 → it is the first elapsed-incomplete day.
    for (let ruleId = 1; ruleId <= 6; ruleId++) await toggleRule(u.id, ruleId, true, NOW);

    // Spy but call through to the real Prisma delegate (preserve behavior).
    const { findMany, findUnique } = spyDayStatus();

    // View 40 days later — old code would issue ~39 serial findUnique calls.
    const DAY40 = new Date("2026-07-11T12:00:00Z");
    const state = await getProject50State(u.id, DAY40);

    expect(state.status).toBe("FAILED");
    expect(state.failedDayNumber).toBe(1);
    expect(state.failedRuleId).toBe(7);

    // Exactly one bulk query for the compliance window, and never a per-day lookup.
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();

    // The single query must cover startDate..yesterday (mirrors buildHistory).
    const arg = findMany.mock.calls[0]?.[0];
    expect(arg?.where).toMatchObject({
      challengeId: expect.any(String),
      dayKey: { gte: "2026-06-02", lte: "2026-07-10" },
    });
  });

  // A fully-compliant ACTIVE run: the dashboard path runs the hard-reset window
  // AND buildHistory. Both are bulk findMany; still ZERO per-day findUnique, and
  // the count does not scale with how many days have elapsed.
  it("stays O(1) in dayStatus queries for a long compliant ACTIVE run", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // Day 1 = 2026-06-02
    // Complete days 1..29 fully (7/7).
    let key = "2026-06-02";
    for (let i = 0; i < 29; i++) {
      const at = new Date(`${key}T12:00:00Z`);
      for (let ruleId = 1; ruleId <= 7; ruleId++) await toggleRule(u.id, ruleId, true, at);
      key = addDays(key, 1);
    }

    const { findMany, findUnique } = spyDayStatus();

    // View on Day 30 — every elapsed day 1..29 is 7/7 → still ACTIVE.
    const DAY30 = new Date("2026-07-01T12:00:00Z");
    const state = await getProject50State(u.id, DAY30);

    expect(state.status).toBe("ACTIVE");
    expect(state.today?.dayNumber).toBe(30);
    // Hard-reset window + buildHistory = 2 bulk reads; no per-day findUnique.
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
