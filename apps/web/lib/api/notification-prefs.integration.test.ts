// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma, resetDb, createUser } from "../../test/db";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  isWithinQuietHours,
} from "./notification-prefs";
import { HttpError } from "./http";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getNotificationPrefs", () => {
  it("returns the defaults for a fresh user (reminders on, no quiet hours)", async () => {
    const u = await createUser({ handle: "alice" });
    expect(await getNotificationPrefs(u.id)).toEqual({
      remindersEnabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  });

  it("throws 404 when the user does not exist", async () => {
    await expect(getNotificationPrefs("missing")).rejects.toMatchObject({
      status: 404,
      code: "ACCOUNT_NOT_FOUND",
    });
  });
});

describe("updateNotificationPrefs", () => {
  it("toggles remindersEnabled off and persists it", async () => {
    const u = await createUser({ handle: "alice" });
    const out = await updateNotificationPrefs(u.id, { remindersEnabled: false });
    expect(out.remindersEnabled).toBe(false);
    const fresh = await prisma.user.findUnique({ where: { id: u.id } });
    expect(fresh!.remindersEnabled).toBe(false);
  });

  it("sets a quiet-hours window", async () => {
    const u = await createUser({ handle: "alice" });
    const out = await updateNotificationPrefs(u.id, {
      quietHoursStart: 22,
      quietHoursEnd: 7,
    });
    expect(out).toEqual({
      remindersEnabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    });
  });

  it("clears a quiet-hours bound when passed null", async () => {
    const u = await createUser({ handle: "alice" });
    await updateNotificationPrefs(u.id, { quietHoursStart: 1, quietHoursEnd: 6 });
    const out = await updateNotificationPrefs(u.id, {
      quietHoursStart: null,
      quietHoursEnd: null,
    });
    expect(out.quietHoursStart).toBeNull();
    expect(out.quietHoursEnd).toBeNull();
  });

  it("accepts the boundary hours 0 and 23", async () => {
    const u = await createUser({ handle: "alice" });
    const out = await updateNotificationPrefs(u.id, {
      quietHoursStart: 0,
      quietHoursEnd: 23,
    });
    expect(out.quietHoursStart).toBe(0);
    expect(out.quietHoursEnd).toBe(23);
  });

  it("rejects an out-of-range start hour with 422", async () => {
    const u = await createUser({ handle: "alice" });
    await expect(
      updateNotificationPrefs(u.id, { quietHoursStart: 24 }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_quiet_hours" });
  });

  it("rejects an out-of-range end hour with 422", async () => {
    const u = await createUser({ handle: "alice" });
    await expect(
      updateNotificationPrefs(u.id, { quietHoursEnd: -1 }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_quiet_hours" });
  });

  it("rejects a non-integer hour with 422", async () => {
    const u = await createUser({ handle: "alice" });
    let thrown: unknown;
    try {
      await updateNotificationPrefs(u.id, { quietHoursStart: 12.5 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect((thrown as HttpError).code).toBe("invalid_quiet_hours");
  });

  it("is a no-op read when no fields are provided", async () => {
    const u = await createUser({ handle: "alice" });
    const out = await updateNotificationPrefs(u.id, {});
    expect(out).toEqual({
      remindersEnabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  });
});

describe("isWithinQuietHours", () => {
  function at(hour: number): Date {
    const d = new Date(2026, 5, 2, hour, 30, 0); // local time
    return d;
  }

  it("returns false when no window is configured (null bounds)", () => {
    expect(
      isWithinQuietHours({ quietHoursStart: null, quietHoursEnd: null }, at(3)),
    ).toBe(false);
    expect(
      isWithinQuietHours({ quietHoursStart: 1, quietHoursEnd: null }, at(3)),
    ).toBe(false);
    expect(
      isWithinQuietHours({ quietHoursStart: null, quietHoursEnd: 6 }, at(3)),
    ).toBe(false);
  });

  it("returns false for an empty window (start == end)", () => {
    expect(
      isWithinQuietHours({ quietHoursStart: 5, quietHoursEnd: 5 }, at(5)),
    ).toBe(false);
  });

  describe("non-wrapping window (1..6)", () => {
    const w = { quietHoursStart: 1, quietHoursEnd: 6 };
    it("is quiet at the start hour (inclusive)", () => {
      expect(isWithinQuietHours(w, at(1))).toBe(true);
    });
    it("is quiet inside the window", () => {
      expect(isWithinQuietHours(w, at(3))).toBe(true);
    });
    it("is not quiet at the end hour (exclusive)", () => {
      expect(isWithinQuietHours(w, at(6))).toBe(false);
    });
    it("is not quiet before the start", () => {
      expect(isWithinQuietHours(w, at(0))).toBe(false);
    });
  });

  describe("wrap-around window (22..7)", () => {
    const w = { quietHoursStart: 22, quietHoursEnd: 7 };
    it("is quiet late at night (>= start)", () => {
      expect(isWithinQuietHours(w, at(23))).toBe(true);
      expect(isWithinQuietHours(w, at(22))).toBe(true);
    });
    it("is quiet early in the morning (< end)", () => {
      expect(isWithinQuietHours(w, at(6))).toBe(true);
      expect(isWithinQuietHours(w, at(0))).toBe(true);
    });
    it("is not quiet during the day", () => {
      expect(isWithinQuietHours(w, at(12))).toBe(false);
    });
    it("is not quiet at the exclusive end hour", () => {
      expect(isWithinQuietHours(w, at(7))).toBe(false);
    });
  });
});
