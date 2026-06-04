// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "@/test/db";
import { startProject50, getProject50State } from "./project50";
import { upsertJournal, getTodayJournal } from "./journal";

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser() {
  return prisma.user.create({ data: { handle: "u", displayName: "U" } });
}
const NOW = new Date("2026-06-02T12:00:00Z");

describe("upsertJournal / getTodayJournal", () => {
  it("writes today's journal on the active run and reads it back", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW); // Day 1 = 2026-06-02

    await upsertJournal(u.id, { wins: "ran 5k", lessons: "start earlier" }, NOW);

    const row = await prisma.dayJournal.findFirst({ where: { challengeId: runId } });
    expect(row).toMatchObject({ dayKey: "2026-06-02", wins: "ran 5k", lessons: "start earlier" });

    const read = await getTodayJournal(u.id, NOW);
    expect(read).toEqual({ wins: "ran 5k", lessons: "start earlier" });
  });

  it("upserts in place: a second save for the same day updates the one row", async () => {
    const u = await makeUser();
    const runId = await startProject50(u.id, "UTC", NOW);

    await upsertJournal(u.id, { wins: "a", lessons: "b" }, NOW);
    await upsertJournal(u.id, { wins: "a2", lessons: "b2" }, NOW);

    const rows = await prisma.dayJournal.findMany({ where: { challengeId: runId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wins: "a2", lessons: "b2" });
  });

  it("uses the run timezone to pick the local dayKey (mirrors toggleRule)", async () => {
    const u = await makeUser();
    // 2026-06-02T02:00:00Z is still 2026-06-01 in America/Toronto (UTC-4).
    const earlyUtc = new Date("2026-06-02T02:00:00Z");
    const runId = await startProject50(u.id, "America/Toronto", earlyUtc);

    await upsertJournal(u.id, { wins: "tz", lessons: "tz" }, earlyUtc);

    const row = await prisma.dayJournal.findFirst({ where: { challengeId: runId } });
    expect(row?.dayKey).toBe("2026-06-01");
  });

  it("getTodayJournal returns null when today has no entry", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    expect(await getTodayJournal(u.id, NOW)).toBeNull();
  });

  it("upsertJournal throws when there is no active run", async () => {
    const u = await makeUser();
    await expect(
      upsertJournal(u.id, { wins: "x", lessons: "y" }, NOW),
    ).rejects.toThrow(/No active Project 50 run/);
  });

  it("getTodayJournal returns null when there is no active run", async () => {
    const u = await makeUser();
    expect(await getTodayJournal(u.id, NOW)).toBeNull();
  });

  it("getProject50State.today.journal surfaces today's saved entry", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    await upsertJournal(u.id, { wins: "won", lessons: "learned" }, NOW);

    const state = await getProject50State(u.id, NOW);
    expect(state.status).toBe("ACTIVE");
    expect(state.today?.journal).toEqual({ wins: "won", lessons: "learned" });
  });

  it("getProject50State.today.journal is undefined when today has no entry", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    const state = await getProject50State(u.id, NOW);
    expect(state.today?.journal).toBeUndefined();
  });
});
