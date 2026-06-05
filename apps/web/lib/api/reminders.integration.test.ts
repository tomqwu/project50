// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma, resetDb } from "@/test/db";
import {
  findUsersNeedingReminder,
  buildReminderEmail,
  sendDailyReminders,
  findStreakAtRiskUsers,
  buildStreakNudgeEmail,
  sendStreakNudges,
} from "./reminders";

const NOW = new Date("2026-06-02T12:00:00Z"); // local day 2026-06-02 (UTC run)
// Late in a UTC run's day (20:00 local), past the default 18:00 risk threshold.
const LATE = new Date("2026-06-02T20:00:00Z");

beforeEach(async () => {
  await resetDb();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  vi.restoreAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});
afterAll(async () => {
  await prisma.$disconnect();
});

let counter = 0;
async function makeUser() {
  counter += 1;
  return prisma.user.create({
    data: { handle: `user${counter}`, displayName: `User ${counter}` },
  });
}
async function makeRun(
  ownerId: string,
  overrides: {
    status?: "ACTIVE" | "FAILED" | "COMPLETED";
    kind?: "PROJECT50" | "STANDARD";
    timezone?: string;
  } = {},
) {
  return prisma.challenge.create({
    data: {
      ownerId,
      title: "Project 50",
      goalType: "BINARY",
      startDate: "2026-06-02",
      timezone: overrides.timezone ?? "UTC",
      lengthDays: 50,
      kind: overrides.kind ?? "PROJECT50",
      status: overrides.status ?? "ACTIVE",
    },
  });
}
async function completeToday(runId: string, dayKey = "2026-06-02", count = 7) {
  for (let ruleId = 1; ruleId <= count; ruleId++) {
    await prisma.ruleCheck.create({ data: { challengeId: runId, dayKey, ruleId, done: true } });
  }
  await prisma.dayStatus.create({
    data: { challengeId: runId, dayKey, completed: count === 7 },
  });
}

describe("findUsersNeedingReminder", () => {
  it("returns users with an ACTIVE PROJECT50 run and no completed day today", async () => {
    const u = await makeUser();
    const run = await makeRun(u.id);
    const out = await findUsersNeedingReminder(NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      userId: u.id,
      handle: u.handle,
      runId: run.id,
      dayKey: "2026-06-02",
      dayNumber: 1,
      completedCount: 0,
      isPlaceholder: true,
    });
    expect(out[0]!.address).toContain(u.handle);
  });

  it("reports partial progress (completedCount) for an incomplete today", async () => {
    const u = await makeUser();
    const run = await makeRun(u.id);
    await completeToday(run.id, "2026-06-02", 3); // 3/7, DayStatus.completed=false
    const out = await findUsersNeedingReminder(NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.completedCount).toBe(3);
  });

  it("excludes a user who already completed 7/7 today", async () => {
    const u = await makeUser();
    const run = await makeRun(u.id);
    await completeToday(run.id, "2026-06-02", 7);
    expect(await findUsersNeedingReminder(NOW)).toHaveLength(0);
  });

  it("excludes non-ACTIVE runs and non-PROJECT50 challenges", async () => {
    const a = await makeUser();
    await makeRun(a.id, { status: "FAILED" });
    const b = await makeUser();
    await makeRun(b.id, { status: "COMPLETED" });
    const c = await makeUser();
    await makeRun(c.id, { kind: "STANDARD" });
    expect(await findUsersNeedingReminder(NOW)).toHaveLength(0);
  });

  it("returns one recipient per active user", async () => {
    const a = await makeUser();
    await makeRun(a.id);
    const b = await makeUser();
    await makeRun(b.id);
    const out = await findUsersNeedingReminder(NOW);
    expect(out.map((r) => r.userId).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("findUsersNeedingReminder — notification preferences (#122)", () => {
  it("skips a user who has turned reminders off", async () => {
    const u = await makeUser();
    await makeRun(u.id);
    await prisma.user.update({
      where: { id: u.id },
      data: { remindersEnabled: false },
    });
    expect(await findUsersNeedingReminder(NOW)).toHaveLength(0);
  });

  it("skips a user currently within their quiet-hours window", async () => {
    const u = await makeUser();
    await makeRun(u.id);
    // Make NOW's local hour fall inside an all-but-one-hour quiet window so the
    // test is independent of the host timezone.
    const localHour = NOW.getHours();
    const start = localHour;
    const end = (localHour + 1) % 24;
    await prisma.user.update({
      where: { id: u.id },
      data: { quietHoursStart: start, quietHoursEnd: end },
    });
    expect(await findUsersNeedingReminder(NOW)).toHaveLength(0);
  });

  it("still nudges a user whose quiet-hours window does not cover now", async () => {
    const u = await makeUser();
    await makeRun(u.id);
    const localHour = NOW.getHours();
    // A 1-hour window starting next hour — excludes the current local hour.
    const start = (localHour + 1) % 24;
    const end = (localHour + 2) % 24;
    await prisma.user.update({
      where: { id: u.id },
      data: { quietHoursStart: start, quietHoursEnd: end },
    });
    expect(await findUsersNeedingReminder(NOW)).toHaveLength(1);
  });
});

describe("buildReminderEmail", () => {
  const base = {
    userId: "u",
    handle: "h",
    displayName: "Dana",
    runId: "r",
    dayKey: "2026-06-02",
    dayNumber: 4,
    address: "h@x.invalid",
    isPlaceholder: true,
  };

  it("uses singular 'rule' when exactly one remains and mentions partial progress", () => {
    const { subject, text, html } = buildReminderEmail({ ...base, completedCount: 6 });
    expect(subject).toBe("Project 50 — Day 4: 1 rule left today");
    expect(text).toContain("Dana");
    expect(text).toContain("6/7");
    expect(html).toContain("<p>");
  });

  it("uses plural and a fresh-start line when nothing is done yet", () => {
    const { subject, text } = buildReminderEmail({ ...base, completedCount: 0 });
    expect(subject).toBe("Project 50 — Day 4: 7 rules left today");
    expect(text).toContain("haven't logged any");
  });
});

describe("sendDailyReminders", () => {
  it("is a no-op returning zeros when email is not configured (no fetch)", async () => {
    const u = await makeUser();
    await makeRun(u.id);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const summary = await sendDailyReminders(NOW);
    expect(summary).toEqual({ sent: 0, skipped: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends one email per needing-user when configured (mock fetch)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@p50.co";
    const a = await makeUser();
    await makeRun(a.id);
    const b = await makeUser();
    await makeRun(b.id);
    const done = await makeUser();
    const doneRun = await makeRun(done.id);
    await completeToday(doneRun.id, "2026-06-02", 7); // excluded

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "m" }), { status: 200 }));

    const summary = await sendDailyReminders(NOW);
    expect(summary).toEqual({ sent: 2, skipped: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("counts a failed provider send as skipped, not sent", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@p50.co";
    const u = await makeUser();
    await makeRun(u.id);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const summary = await sendDailyReminders(NOW);
    expect(summary).toEqual({ sent: 0, skipped: 1 });
  });
});

describe("findStreakAtRiskUsers (#123)", () => {
  it("flags an ACTIVE PROJECT50 user whose day is incomplete and it's late", async () => {
    const u = await makeUser();
    const run = await makeRun(u.id);
    await completeToday(run.id, "2026-06-02", 4); // 4/7, incomplete
    const out = await findStreakAtRiskUsers(LATE);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      userId: u.id,
      runId: run.id,
      dayKey: "2026-06-02",
      dayNumber: 1,
      completedCount: 4,
    });
  });

  it("does NOT flag a user earlier in their day (before the risk hour)", async () => {
    const u = await makeUser();
    await makeRun(u.id);
    // NOW is noon (12:00) local for a UTC run — before the 18:00 default.
    expect(await findStreakAtRiskUsers(NOW)).toHaveLength(0);
  });

  it("does NOT flag a user who already completed 7/7 today even when late", async () => {
    const u = await makeUser();
    const run = await makeRun(u.id);
    await completeToday(run.id, "2026-06-02", 7);
    expect(await findStreakAtRiskUsers(LATE)).toHaveLength(0);
  });

  it("respects a configurable risk hour", async () => {
    const u = await makeUser();
    await makeRun(u.id);
    // At noon, not at risk with the default 18, but at risk with a 10:00 cutoff.
    expect(await findStreakAtRiskUsers(NOW, 18)).toHaveLength(0);
    expect(await findStreakAtRiskUsers(NOW, 10)).toHaveLength(1);
  });

  it("evaluates lateness in the run's own timezone", async () => {
    // 20:00 UTC is 16:00 in New York (UTC-4 in June) — before 18:00 → not late.
    const u = await makeUser();
    await makeRun(u.id, { timezone: "America/New_York" });
    expect(await findStreakAtRiskUsers(LATE)).toHaveLength(0);
  });

  it("treats a run with a malformed stored timezone as UTC instead of aborting", async () => {
    // A legacy/garbage stored zone must not throw and abort selection for ALL
    // runs; localHour falls back to UTC, so at 20:00 UTC this run is still late.
    const u = await makeUser();
    const run = await makeRun(u.id, { timezone: "Not/A_Zone" });
    await completeToday(run.id, "2026-06-02", 4);
    const out = await findStreakAtRiskUsers(LATE);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ userId: u.id, runId: run.id });
  });

  it("excludes non-ACTIVE runs and non-PROJECT50 challenges", async () => {
    const a = await makeUser();
    await makeRun(a.id, { status: "FAILED" });
    const b = await makeUser();
    await makeRun(b.id, { kind: "STANDARD" });
    expect(await findStreakAtRiskUsers(LATE)).toHaveLength(0);
  });

  it("skips a user who has turned reminders off", async () => {
    const u = await makeUser();
    await makeRun(u.id);
    await prisma.user.update({
      where: { id: u.id },
      data: { remindersEnabled: false },
    });
    expect(await findStreakAtRiskUsers(LATE)).toHaveLength(0);
  });

  it("skips a user currently within their quiet-hours window", async () => {
    const u = await makeUser();
    await makeRun(u.id);
    const localHour = LATE.getHours();
    await prisma.user.update({
      where: { id: u.id },
      data: { quietHoursStart: localHour, quietHoursEnd: (localHour + 1) % 24 },
    });
    expect(await findStreakAtRiskUsers(LATE)).toHaveLength(0);
  });
});

describe("buildStreakNudgeEmail (#123)", () => {
  const base = {
    userId: "u",
    handle: "h",
    displayName: "Dana",
    runId: "r",
    dayKey: "2026-06-02",
    dayNumber: 9,
    address: "h@x.invalid",
    isPlaceholder: true,
  };

  it("uses streak-at-risk messaging distinct from the daily reminder", () => {
    const { subject, text, html } = buildStreakNudgeEmail({ ...base, completedCount: 5 });
    expect(subject).toMatch(/streak/i);
    expect(subject).toMatch(/risk/i);
    expect(subject).toContain("Day 9");
    expect(text).toContain("Dana");
    expect(text).toMatch(/streak/i);
    expect(text).toContain("5/7");
    expect(html).toContain("<p>");
  });

  it("handles a user who has logged nothing yet", () => {
    const { text } = buildStreakNudgeEmail({ ...base, completedCount: 0 });
    expect(text).toMatch(/streak/i);
    expect(text).toContain("0/7");
  });

  it("uses singular 'rule' when exactly one remains", () => {
    const { subject } = buildStreakNudgeEmail({ ...base, completedCount: 6 });
    expect(subject).toContain("1 rule");
  });
});

describe("sendStreakNudges (#123)", () => {
  it("is a no-op returning zeros when email is not configured (no fetch)", async () => {
    const u = await makeUser();
    const run = await makeRun(u.id);
    await completeToday(run.id, "2026-06-02", 3);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const summary = await sendStreakNudges(LATE);
    expect(summary).toEqual({ sent: 0, skipped: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends one nudge per at-risk user when configured (mock fetch)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@p50.co";
    const a = await makeUser();
    const ra = await makeRun(a.id);
    await completeToday(ra.id, "2026-06-02", 2); // at risk
    const done = await makeUser();
    const rd = await makeRun(done.id);
    await completeToday(rd.id, "2026-06-02", 7); // complete → excluded

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "m" }), { status: 200 }));

    const summary = await sendStreakNudges(LATE);
    expect(summary).toEqual({ sent: 1, skipped: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("counts a failed provider send as skipped, not sent", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@p50.co";
    const u = await makeUser();
    await makeRun(u.id);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const summary = await sendStreakNudges(LATE);
    expect(summary).toEqual({ sent: 0, skipped: 1 });
  });
});
