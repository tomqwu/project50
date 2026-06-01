// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll } from "vitest";
import { prisma, resetDb, createUser, createChallenge } from "./db";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("resetDb", () => {
  it("leaves tables empty", async () => {
    const count = await prisma.user.count();
    expect(count).toBe(0);
  });

  it("does not fail on repeated calls", async () => {
    await expect(resetDb()).resolves.toBeUndefined();
  });
});

describe("createUser", () => {
  it("persists a user and returns it", async () => {
    const user = await createUser({ handle: "alice", displayName: "Alice" });
    expect(user.id).toBeTruthy();
    expect(user.handle).toBe("alice");
    expect(user.displayName).toBe("Alice");

    const found = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(found.handle).toBe("alice");
  });

  it("generates a unique handle when none provided", async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    expect(u1.handle).not.toBe(u2.handle);
  });
});

describe("createChallenge", () => {
  it("persists a challenge with default values", async () => {
    const user = await createUser({ handle: "bob" });
    const challenge = await createChallenge(user.id);

    expect(challenge.id).toBeTruthy();
    expect(challenge.ownerId).toBe(user.id);
    expect(challenge.title).toBe("Test");
    expect(challenge.goalType).toBe("TARGET");
    expect(challenge.dailyTarget).toBe(60);
    expect(challenge.startDate).toBe("2026-06-01");
    expect(challenge.lengthDays).toBe(50);
    expect(challenge.timezone).toBe("UTC");
    expect(challenge.visibility).toBe("PUBLIC");

    const found = await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(found.ownerId).toBe(user.id);
  });

  it("respects overrides", async () => {
    const user = await createUser({ handle: "carol" });
    const challenge = await createChallenge(user.id, {
      title: "My Run",
      goalType: "BINARY",
      startDate: "2026-07-01",
      lengthDays: 30,
      visibility: "PRIVATE",
    });

    expect(challenge.title).toBe("My Run");
    expect(challenge.goalType).toBe("BINARY");
    expect(challenge.startDate).toBe("2026-07-01");
    expect(challenge.lengthDays).toBe(30);
    expect(challenge.visibility).toBe("PRIVATE");
  });

  it("can create multiple challenges for the same user", async () => {
    const user = await createUser({ handle: "dave" });
    await createChallenge(user.id, { title: "A" });
    await createChallenge(user.id, { title: "B" });

    const count = await prisma.challenge.count({ where: { ownerId: user.id } });
    expect(count).toBe(2);
  });
});
