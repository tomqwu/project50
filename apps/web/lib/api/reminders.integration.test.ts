// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma, resetDb } from "@/test/db";
import {
  findUsersNeedingReminder,
  buildReminderEmail,
  sendDailyReminders,
} from "./reminders";

const NOW = new Date("2026-06-02T12:00:00Z"); // local day 2026-06-02 (UTC run)

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
  overrides: { status?: "ACTIVE" | "FAILED" | "COMPLETED"; kind?: "PROJECT50" | "STANDARD"; timezone?: string } = {},
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
