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

async function setStatus(userId: string, status: SubscriptionStatus) {
  await prisma.subscription.create({ data: { userId, status } });
}

describe("entitlementForStatus", () => {
  it("maps ACTIVE and TRIALING to premium", () => {
    expect(entitlementForStatus("ACTIVE")).toEqual({
      plan: "premium",
      isPremium: true,
    });
    expect(entitlementForStatus("TRIALING")).toEqual({
      plan: "premium",
      isPremium: true,
    });
  });

  it("maps PAST_DUE, CANCELED, NONE to free", () => {
    for (const status of ["PAST_DUE", "CANCELED", "NONE"] as const) {
      expect(entitlementForStatus(status)).toEqual({
        plan: "free",
        isPremium: false,
      });
    }
  });

  it("treats null/undefined (no subscription) as free", () => {
    expect(entitlementForStatus(null)).toEqual({
      plan: "free",
      isPremium: false,
    });
    expect(entitlementForStatus(undefined)).toEqual({
      plan: "free",
      isPremium: false,
    });
  });
});

describe("getEntitlement", () => {
  it("returns free when the user has no subscription row", async () => {
    const user = await createUser();
    await expect(getEntitlement(user.id)).resolves.toEqual({
      plan: "free",
      isPremium: false,
    });
  });

  it("returns premium for an ACTIVE subscription", async () => {
    const user = await createUser();
    await setStatus(user.id, "ACTIVE");
    await expect(getEntitlement(user.id)).resolves.toEqual({
      plan: "premium",
      isPremium: true,
    });
  });

  it("returns premium for a TRIALING subscription", async () => {
    const user = await createUser();
    await setStatus(user.id, "TRIALING");
    await expect(getEntitlement(user.id)).resolves.toEqual({
      plan: "premium",
      isPremium: true,
    });
  });

  it("returns free for a PAST_DUE subscription", async () => {
    const user = await createUser();
    await setStatus(user.id, "PAST_DUE");
    await expect(getEntitlement(user.id)).resolves.toEqual({
      plan: "free",
      isPremium: false,
    });
  });
});

describe("requirePremium", () => {
  it("resolves the entitlement for a premium user", async () => {
    const user = await createUser();
    await setStatus(user.id, "ACTIVE");
    await expect(requirePremium(user.id)).resolves.toEqual({
      plan: "premium",
      isPremium: true,
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
