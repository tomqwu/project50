// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll } from "vitest";
import { resolveOAuthUser } from "./auth-callbacks";
import { prisma, resetDb } from "@/test/db";

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("resolveOAuthUser", () => {
  it("creates a User + Identity for a new identity and returns the uid", async () => {
    const uid = await resolveOAuthUser({
      provider: "FACEBOOK",
      providerAccountId: "fb-1",
      name: "Alice",
      email: "alice@example.com",
    });
    const identity = await prisma.identity.findUnique({
      where: {
        provider_providerAccountId: { provider: "FACEBOOK", providerAccountId: "fb-1" },
      },
      include: { user: true },
    });
    expect(identity?.user.id).toBe(uid);
    expect(identity?.user.handle).toBe("alice");
  });

  it("reuses the existing user for a known identity and refreshes displayName", async () => {
    const first = await resolveOAuthUser({
      provider: "FACEBOOK",
      providerAccountId: "fb-2",
      name: "Bob",
    });
    const second = await resolveOAuthUser({
      provider: "FACEBOOK",
      providerAccountId: "fb-2",
      name: "Bobby",
    });
    expect(second).toBe(first);
    const user = await prisma.user.findUnique({ where: { id: first } });
    expect(user?.displayName).toBe("Bobby");
  });

  it("disambiguates colliding handles", async () => {
    const a = await resolveOAuthUser({
      provider: "FACEBOOK",
      providerAccountId: "fb-3",
      email: "sam@a.com",
    });
    const b = await resolveOAuthUser({
      provider: "GOOGLE",
      providerAccountId: "g-3",
      email: "sam@b.com",
    });
    const ua = await prisma.user.findUnique({ where: { id: a } });
    const ub = await prisma.user.findUnique({ where: { id: b } });
    expect(new Set([ua?.handle, ub?.handle]).size).toBe(2);
  });
});
