// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma, resetDb, createUser, createChallenge } from "../../test/db";
import { logActivity } from "./activities";
import { HttpError } from "./http";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("logActivity — TARGET challenge", () => {
  it("creates an activity and DayStatus with correct totalAmount (below target)", async () => {
    const user = await createUser({ handle: "alice" });
    const challenge = await createChallenge(user.id, {
      goalType: "TARGET",
      dailyTarget: 60,
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    const { activity, dayStatus } = await logActivity(
      user.id,
      challenge.id,
      { dayKey: "2026-06-01", amount: 30 },
      "2026-06-01",
    );

    expect(activity.id).toBeTruthy();
    expect(activity.amount).toBe(30);
    expect(dayStatus.totalAmount).toBe(30);
    expect(dayStatus.completed).toBe(false);
  });

  it("two activities summing to target flip DayStatus.completed to true", async () => {
    const user = await createUser({ handle: "alice" });
    const challenge = await createChallenge(user.id, {
      goalType: "TARGET",
      dailyTarget: 60,
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    await logActivity(
      user.id, challenge.id, { dayKey: "2026-06-01", amount: 30 }, "2026-06-01",
    );

    const { dayStatus } = await logActivity(
      user.id, challenge.id, { dayKey: "2026-06-01", amount: 30 }, "2026-06-01",
    );

    expect(dayStatus.totalAmount).toBe(60);
    expect(dayStatus.completed).toBe(true);
  });
});

describe("logActivity — BINARY challenge", () => {
  it("done=true completes the day", async () => {
    const user = await createUser({ handle: "bob" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    const { dayStatus } = await logActivity(
      user.id, challenge.id, { dayKey: "2026-06-01", done: true }, "2026-06-01",
    );

    expect(dayStatus.completed).toBe(true);
  });

  it("done=false does not complete the day", async () => {
    const user = await createUser({ handle: "bob" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    const { dayStatus } = await logActivity(
      user.id, challenge.id, { dayKey: "2026-06-01", done: false }, "2026-06-01",
    );

    expect(dayStatus.completed).toBe(false);
  });
});

describe("logActivity — validation errors", () => {
  it("throws 422 INVALID_ACTIVITY when dayKey is in future (asOf is earlier)", async () => {
    const user = await createUser({ handle: "carol" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    await expect(
      logActivity(
        user.id, challenge.id, { dayKey: "2026-06-10", done: true }, "2026-06-01",
      ),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ACTIVITY" });
  });

  it("throws 422 INVALID_ACTIVITY for negative amount", async () => {
    const user = await createUser({ handle: "dave" });
    const challenge = await createChallenge(user.id, {
      goalType: "TARGET",
      dailyTarget: 60,
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    await expect(
      logActivity(
        user.id, challenge.id, { dayKey: "2026-06-01", amount: -5 }, "2026-06-01",
      ),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ACTIVITY" });
  });

  it("throws 422 INVALID_ACTIVITY detail contains DAY_IN_FUTURE", async () => {
    const user = await createUser({ handle: "eve" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    const err = await logActivity(
      user.id, challenge.id, { dayKey: "2026-06-10", done: true }, "2026-06-01",
    ).catch((e: HttpError) => e);

    expect(err).toBeInstanceOf(HttpError);
    const detail = (err as HttpError).detail as string[];
    expect(detail).toContain("DAY_IN_FUTURE");
  });
});

describe("logActivity — authorization", () => {
  it("throws 404 for missing challenge", async () => {
    const user = await createUser({ handle: "alice" });
    await expect(
      logActivity(user.id, "nonexistent", { dayKey: "2026-06-01" }, "2026-06-01"),
    ).rejects.toMatchObject({ status: 404, code: "CHALLENGE_NOT_FOUND" });
  });

  it("throws 403 FORBIDDEN when non-owner tries to log", async () => {
    const owner = await createUser({ handle: "alice" });
    const other = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    await expect(
      logActivity(other.id, challenge.id, { dayKey: "2026-06-01", done: true }, "2026-06-01"),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});

describe("logActivity — milestones", () => {
  it("earns COMPLETED_7 after 7 completed days", async () => {
    const user = await createUser({ handle: "alice" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    // Log 7 consecutive days
    let lastResult;
    for (let i = 0; i < 7; i++) {
      const dayKey = `2026-06-0${i + 1}`;
      lastResult = await logActivity(
        user.id, challenge.id, { dayKey, done: true }, dayKey,
      );
    }

    expect(lastResult!.newMilestones.some((m) => m.kind === "COMPLETED_7")).toBe(true);
  });

  it("milestone upsert is idempotent (logging again after earning doesn't duplicate)", async () => {
    const user = await createUser({ handle: "alice" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    // Log 7 days to earn COMPLETED_7
    for (let i = 0; i < 7; i++) {
      const dayKey = `2026-06-0${i + 1}`;
      await logActivity(user.id, challenge.id, { dayKey, done: true }, dayKey);
    }

    // Log one more activity on day 7 (re-earn)
    await logActivity(
      user.id, challenge.id, { dayKey: "2026-06-07", done: true }, "2026-06-07",
    );

    const milestoneCount = await prisma.milestone.count({
      where: { challengeId: challenge.id, kind: "COMPLETED_7" },
    });
    expect(milestoneCount).toBe(1);
  });

  it("earns STREAK_7 after 7 consecutive days", async () => {
    const user = await createUser({ handle: "alice" });
    const challenge = await createChallenge(user.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    let lastResult;
    for (let i = 0; i < 7; i++) {
      const dayKey = `2026-06-0${i + 1}`;
      lastResult = await logActivity(
        user.id, challenge.id, { dayKey, done: true }, dayKey,
      );
    }

    expect(lastResult!.newMilestones.some((m) => m.kind === "STREAK_7")).toBe(true);
  });
});
