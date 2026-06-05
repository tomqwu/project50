// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "@/test/db";
import { addDays, PROJECT50_LENGTH_DAYS } from "@project50/core";
import {
  startProject50,
  getProject50State,
  toggleRule,
  getProject50History,
  attachProject50DayMedia,
  listProject50DayMedia,
} from "./project50";

beforeEach(resetDb);
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
});
