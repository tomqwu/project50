// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma, resetDb, createUser } from "../../test/db";
import {
  getOrCreateReferralCode,
  getReferralStats,
  recordReferral,
} from "./referral";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getOrCreateReferralCode", () => {
  it("creates and stores a code on first call", async () => {
    const alice = await createUser({ handle: "alice" });

    const code = await getOrCreateReferralCode(alice.id);

    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    const fresh = await prisma.user.findUnique({ where: { id: alice.id } });
    expect(fresh!.referralCode).toBe(code);
  });

  it("returns the same stored code on subsequent calls (stable)", async () => {
    const alice = await createUser({ handle: "alice" });

    const first = await getOrCreateReferralCode(alice.id);
    const second = await getOrCreateReferralCode(alice.id);

    expect(second).toBe(first);
  });

  it("gives different users different codes", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    const a = await getOrCreateReferralCode(alice.id);
    const b = await getOrCreateReferralCode(bob.id);

    expect(a).not.toBe(b);
  });

  it("throws for an unknown user", async () => {
    await expect(getOrCreateReferralCode("nonexistent")).rejects.toMatchObject({
      status: 422,
      code: "USER_NOT_FOUND",
    });
  });
});

describe("recordReferral", () => {
  it("records a referral and returns true", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const newUser = await createUser({ handle: "newbie" });

    const result = await recordReferral(code, newUser.id);

    expect(result).toBe(true);
    const row = await prisma.referral.findUnique({
      where: { referredUserId: newUser.id },
    });
    expect(row).toMatchObject({
      referrerId: referrer.id,
      referredUserId: newUser.id,
      code,
    });
  });

  it("returns false for an unknown referrer code", async () => {
    const newUser = await createUser({ handle: "newbie" });

    const result = await recordReferral("NOPECODE", newUser.id);

    expect(result).toBe(false);
    expect(await prisma.referral.count()).toBe(0);
  });

  it("rejects self-referral", async () => {
    const alice = await createUser({ handle: "alice" });
    const code = await getOrCreateReferralCode(alice.id);

    const result = await recordReferral(code, alice.id);

    expect(result).toBe(false);
    expect(await prisma.referral.count()).toBe(0);
  });

  it("rejects a duplicate referral for an already-referred user", async () => {
    const r1 = await createUser({ handle: "r1" });
    const r2 = await createUser({ handle: "r2" });
    const code1 = await getOrCreateReferralCode(r1.id);
    const code2 = await getOrCreateReferralCode(r2.id);
    const newUser = await createUser({ handle: "newbie" });

    const first = await recordReferral(code1, newUser.id);
    const second = await recordReferral(code2, newUser.id);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await prisma.referral.count()).toBe(1);
    const row = await prisma.referral.findUnique({
      where: { referredUserId: newUser.id },
    });
    expect(row!.referrerId).toBe(r1.id);
  });
});

describe("getReferralStats", () => {
  it("returns the code and a zero count for a fresh user", async () => {
    const alice = await createUser({ handle: "alice" });

    const stats = await getReferralStats(alice.id);

    expect(stats.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(stats.referredCount).toBe(0);
    const fresh = await prisma.user.findUnique({ where: { id: alice.id } });
    expect(fresh!.referralCode).toBe(stats.code);
  });

  it("counts the people the user has referred", async () => {
    const referrer = await createUser({ handle: "referrer" });
    const code = await getOrCreateReferralCode(referrer.id);
    const n1 = await createUser({ handle: "n1" });
    const n2 = await createUser({ handle: "n2" });
    await recordReferral(code, n1.id);
    await recordReferral(code, n2.id);

    const stats = await getReferralStats(referrer.id);

    expect(stats.code).toBe(code);
    expect(stats.referredCount).toBe(2);
  });
});
