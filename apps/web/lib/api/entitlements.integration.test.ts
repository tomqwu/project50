// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll } from "vitest";
import { vi } from "vitest";

// http.ts imports @/lib/session → next-auth, which can't load under vitest.
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { prisma, resetDb, createUser } from "../../test/db";
import {
  entitlementForStatus,
  getEntitlement,
  requirePremium,
  type SubscriptionStatus,
} from "./entitlements";
import { HttpError } from "./http";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setStatus(
  userId: string,
  status: SubscriptionStatus,
  currentPeriodEnd?: Date,
) {
  await prisma.subscription.create({ data: { userId, status, currentPeriodEnd } });
}

describe("entitlementForStatus", () => {
  it("maps ACTIVE and TRIALING to premium", () => {
    expect(entitlementForStatus("ACTIVE")).toMatchObject({
      plan: "premium",
      isPremium: true,
      status: "ACTIVE",
    });
    expect(entitlementForStatus("TRIALING")).toMatchObject({
      plan: "premium",
      isPremium: true,
      status: "TRIALING",
    });
  });

  it("maps PAST_DUE, CANCELED, NONE to free", () => {
    for (const status of ["PAST_DUE", "CANCELED", "NONE"] as const) {
      expect(entitlementForStatus(status)).toMatchObject({
        plan: "free",
        isPremium: false,
        status,
      });
    }
  });

  it("treats null/undefined (no subscription) as free with NONE status", () => {
    expect(entitlementForStatus(null)).toMatchObject({
      plan: "free",
      isPremium: false,
      status: "NONE",
    });
    expect(entitlementForStatus(undefined)).toMatchObject({
      plan: "free",
      isPremium: false,
      status: "NONE",
    });
  });

  it("carries an optional currentPeriodEnd through", () => {
    const end = new Date("2026-07-01T00:00:00.000Z");
    expect(entitlementForStatus("TRIALING", end)).toMatchObject({
      status: "TRIALING",
      currentPeriodEnd: end,
    });
    // Defaults to null when omitted.
    expect(entitlementForStatus("ACTIVE").currentPeriodEnd).toBeNull();
  });
});

describe("getEntitlement", () => {
  it("returns free with NONE status when the user has no subscription row", async () => {
    const user = await createUser();
    await expect(getEntitlement(user.id)).resolves.toMatchObject({
      plan: "free",
      isPremium: false,
      status: "NONE",
      currentPeriodEnd: null,
    });
  });

  it("returns premium for an ACTIVE subscription", async () => {
    const user = await createUser();
    await setStatus(user.id, "ACTIVE");
    await expect(getEntitlement(user.id)).resolves.toMatchObject({
      plan: "premium",
      isPremium: true,
      status: "ACTIVE",
    });
  });

  it("returns premium and the trial end for a TRIALING subscription", async () => {
    const user = await createUser();
    const end = new Date("2026-08-15T00:00:00.000Z");
    await setStatus(user.id, "TRIALING", end);
    await expect(getEntitlement(user.id)).resolves.toMatchObject({
      plan: "premium",
      isPremium: true,
      status: "TRIALING",
      currentPeriodEnd: end,
    });
  });

  it("returns free for a PAST_DUE subscription", async () => {
    const user = await createUser();
    await setStatus(user.id, "PAST_DUE");
    await expect(getEntitlement(user.id)).resolves.toMatchObject({
      plan: "free",
      isPremium: false,
      status: "PAST_DUE",
    });
  });
});

describe("requirePremium", () => {
  it("resolves the entitlement for a premium user", async () => {
    const user = await createUser();
    await setStatus(user.id, "ACTIVE");
    await expect(requirePremium(user.id)).resolves.toMatchObject({
      plan: "premium",
      isPremium: true,
      status: "ACTIVE",
    });
  });

  it("throws 403 premium_required for a free user", async () => {
    const user = await createUser();
    let thrown: HttpError | undefined;
    try {
      await requirePremium(user.id);
    } catch (err) {
      thrown = err as HttpError;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown!.status).toBe(403);
    expect(thrown!.code).toBe("premium_required");
  });
});
