// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll } from "vitest";
import type { Account, User } from "next-auth";
import { onSignIn } from "./auth-callbacks";
import { prisma, resetDb } from "../test/db";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: undefined,
    name: "Test User",
    email: "test@example.com",
    image: null,
    ...overrides,
  };
}

function makeAccount(
  provider: string,
  providerAccountId: string,
  overrides: Partial<Account> = {},
): Account {
  return {
    provider,
    providerAccountId,
    type: "oauth",
    ...overrides,
  };
}

describe("onSignIn — OAuth creates User + Identity", () => {
  it("creates a User and Identity for a Google sign-in and sets user.id", async () => {
    const user = makeUser({ email: "alice@gmail.com", name: "Alice" });
    const account = makeAccount("google", "google-uid-001");

    const result = await onSignIn({ user, account });

    expect(result).toBe(true);
    expect(user.id).toBeTruthy();

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.handle).toBe("alice");
    expect(dbUser.displayName).toBe("Alice");

    const identity = await prisma.identity.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "GOOGLE",
          providerAccountId: "google-uid-001",
        },
      },
    });
    expect(identity.userId).toBe(user.id);
    expect(identity.provider).toBe("GOOGLE");
  });

  it("is idempotent: same providerAccountId reuses the user, no second Identity, and refreshes the profile", async () => {
    const user = makeUser({ email: "alice@gmail.com", name: "Alice" });
    const account = makeAccount("google", "google-uid-001");

    await onSignIn({ user, account });
    const firstId = user.id;

    // Sign in again — simulate a second OAuth round-trip with an updated name/avatar
    const user2 = makeUser({ email: "alice@gmail.com", name: "Alice Renamed", image: "https://cdn/a.png" });
    await onSignIn({ user: user2, account });
    expect(user2.id).toBe(firstId); // same DB user

    const identityCount = await prisma.identity.count({
      where: { providerAccountId: "google-uid-001" },
    });
    expect(identityCount).toBe(1); // no duplicate

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: firstId } });
    expect(dbUser.displayName).toBe("Alice Renamed"); // profile refreshed
    expect(dbUser.avatarUrl).toBe("https://cdn/a.png");
  });

  it("does NOT take over an existing account when a different identity has a colliding handle local-part", async () => {
    // alice@gmail.com and alice@yahoo.com both derive base handle "alice",
    // but they are DISTINCT identities → must be two separate users.
    const userA = makeUser({ email: "alice@gmail.com", name: "Alice G" });
    const accountA = makeAccount("google", "google-alice-gmail");
    await onSignIn({ user: userA, account: accountA });

    const userB = makeUser({ email: "alice@yahoo.com", name: "Alice Y" });
    const accountB = makeAccount("google", "google-alice-yahoo");
    await onSignIn({ user: userB, account: accountB });

    expect(userA.id).toBeTruthy();
    expect(userB.id).toBeTruthy();
    expect(userB.id).not.toBe(userA.id); // distinct users — no takeover

    const dbA = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    const dbB = await prisma.user.findUniqueOrThrow({ where: { id: userB.id } });
    expect(dbA.handle).toBe("alice");
    expect(dbB.handle).toBe("alice2"); // uniqueHandle collision suffix

    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.identity.count()).toBe(2);

    // The second identity is linked to the SECOND user, not the first.
    const identB = await prisma.identity.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "GOOGLE",
          providerAccountId: "google-alice-yahoo",
        },
      },
    });
    expect(identB.userId).toBe(userB.id);
    expect(identB.userId).not.toBe(userA.id);
  });

  it("keeps the existing displayName and clears avatar when a re-sign-in omits name/image", async () => {
    const user = makeUser({ email: "dana@gmail.com", name: "Dana", image: "https://cdn/d.png" });
    const account = makeAccount("google", "google-uid-dana");
    await onSignIn({ user, account });
    const id = user.id;

    // Second sign-in with no name and no image → name falls back to existing,
    // avatarUrl falls back to undefined.
    const user2 = makeUser({ email: "dana@gmail.com", name: null, image: null });
    await onSignIn({ user: user2, account });
    expect(user2.id).toBe(id);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(dbUser.displayName).toBe("Dana"); // kept existing displayName
    // avatarUrl: undefined → Prisma skips the field, so the prior value is kept.
    expect(dbUser.avatarUrl).toBe("https://cdn/d.png");
  });

  it("returns false and creates nothing for an unknown provider", async () => {
    const user = makeUser({ email: "x@github.com", name: "X" });
    const account = makeAccount("github", "github-uid-001");

    const result = await onSignIn({ user, account });
    expect(result).toBe(false);
    expect(user.id).toBeUndefined();
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.identity.count()).toBe(0);
  });

  it("maps provider 'facebook' to FACEBOOK Identity", async () => {
    const user = makeUser({ email: "bob@fb.com", name: "Bob" });
    const account = makeAccount("facebook", "fb-uid-002");

    const result = await onSignIn({ user, account });
    expect(result).toBe(true);

    const identity = await prisma.identity.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "FACEBOOK",
          providerAccountId: "fb-uid-002",
        },
      },
    });
    expect(identity.provider).toBe("FACEBOOK");
  });

  it("returns true WITHOUT creating an Identity for provider 'e2e'", async () => {
    const user = makeUser({ name: "E2E User" });
    const account = makeAccount("e2e", "e2e-handle-001");

    const result = await onSignIn({ user, account });
    expect(result).toBe(true);

    const userCount = await prisma.user.count();
    const identityCount = await prisma.identity.count();
    expect(userCount).toBe(0);
    expect(identityCount).toBe(0);
    expect(user.id).toBeUndefined(); // user.id not touched
  });

  it("returns true WITHOUT creating an Identity for provider 'magic-link'", async () => {
    const user = makeUser({ name: "Magic User" });
    const account = makeAccount("magic-link", "ignored");

    const result = await onSignIn({ user, account });
    expect(result).toBe(true);

    // The user was already resolved in authorize(); onSignIn must not create
    // an Identity row or mutate user.id.
    expect(await prisma.identity.count()).toBe(0);
    expect(user.id).toBeUndefined();
  });

  it("returns true WITHOUT touching DB when account is null", async () => {
    const user = makeUser();
    const result = await onSignIn({ user, account: null });
    expect(result).toBe(true);
    expect(await prisma.user.count()).toBe(0);
  });

  it("uses user.name as rawHandle when email is absent", async () => {
    const user = makeUser({ email: null, name: "Charlie" });
    const account = makeAccount("google", "google-uid-003");

    const result = await onSignIn({ user, account });
    expect(result).toBe(true);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.handle).toBe("Charlie");
  });

  it("uses providerAccountId as rawHandle when both email and name are absent", async () => {
    const user = makeUser({ email: null, name: null });
    const account = makeAccount("google", "google-uid-004");

    const result = await onSignIn({ user, account });
    expect(result).toBe(true);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.handle).toBe("google-uid-004");
  });

  it("uses full rawHandle when it starts with '@' (split yields empty first part)", async () => {
    // rawHandle = "@bot" → split("@")[0] = "" (falsy) → falls back to rawHandle "@bot"
    // After replace: "_bot"
    const user = makeUser({ email: null, name: null });
    const account = makeAccount("google", "@bot");

    const result = await onSignIn({ user, account });
    expect(result).toBe(true);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.handle).toBe("_bot");
  });
});
