// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma, resetDb, createUser } from "../../test/db";
import { getAccount, updateAccount, deleteAccount } from "./account";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getAccount", () => {
  it("returns the user's handle and displayName", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    const account = await getAccount(alice.id);

    expect(account).toEqual({ handle: "alice", displayName: "Alice A" });
  });

  it("throws 404 ACCOUNT_NOT_FOUND for unknown user", async () => {
    await expect(getAccount("nonexistent")).rejects.toMatchObject({
      status: 404,
      code: "ACCOUNT_NOT_FOUND",
    });
  });
});

describe("updateAccount", () => {
  it("updates displayName only", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    const result = await updateAccount(alice.id, { displayName: "Alice B" });

    expect(result).toEqual({ handle: "alice", displayName: "Alice B" });
    const fresh = await prisma.user.findUnique({ where: { id: alice.id } });
    expect(fresh!.displayName).toBe("Alice B");
  });

  it("updates handle only", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    const result = await updateAccount(alice.id, { handle: "alice2" });

    expect(result).toEqual({ handle: "alice2", displayName: "Alice A" });
  });

  it("updates both displayName and handle", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    const result = await updateAccount(alice.id, {
      displayName: "New Name",
      handle: "newhandle",
    });

    expect(result).toEqual({ handle: "newhandle", displayName: "New Name" });
  });

  it("trims displayName and handle before saving", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    const result = await updateAccount(alice.id, {
      displayName: "  Trimmed  ",
      handle: "  trimmed_handle  ",
    });

    expect(result).toEqual({
      handle: "trimmed_handle",
      displayName: "Trimmed",
    });
  });

  it("returns current values when no fields provided", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    const result = await updateAccount(alice.id, {});

    expect(result).toEqual({ handle: "alice", displayName: "Alice A" });
  });

  it("allows setting handle to its own current value (no self-conflict)", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    const result = await updateAccount(alice.id, { handle: "alice" });

    expect(result).toEqual({ handle: "alice", displayName: "Alice A" });
  });

  it("throws 422 invalid_handle when handle is empty after trim", async () => {
    const alice = await createUser({ handle: "alice" });

    await expect(updateAccount(alice.id, { handle: "   " })).rejects.toMatchObject({
      status: 422,
      code: "invalid_handle",
    });
  });

  it("throws 422 invalid_handle when handle is too short", async () => {
    const alice = await createUser({ handle: "alice" });

    await expect(updateAccount(alice.id, { handle: "ab" })).rejects.toMatchObject({
      status: 422,
      code: "invalid_handle",
    });
  });

  it("throws 422 invalid_handle when handle has invalid characters", async () => {
    const alice = await createUser({ handle: "alice" });

    await expect(
      updateAccount(alice.id, { handle: "bad handle!" }),
    ).rejects.toMatchObject({
      status: 422,
      code: "invalid_handle",
    });
  });

  it("throws 422 handle_taken when handle belongs to another user", async () => {
    const alice = await createUser({ handle: "alice" });
    await createUser({ handle: "bob" });

    await expect(
      updateAccount(alice.id, { handle: "bob" }),
    ).rejects.toMatchObject({
      status: 422,
      code: "handle_taken",
    });
  });

  it("throws 422 invalid_handle when displayName is empty after trim", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    await expect(
      updateAccount(alice.id, { displayName: "   " }),
    ).rejects.toMatchObject({
      status: 422,
      code: "invalid_display_name",
    });
  });
});

describe("deleteAccount", () => {
  it("deletes the user and cascades all of their data", async () => {
    const { createChallenge } = await import("../../test/db");
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });
    const challenge = await createChallenge(alice.id, { title: "Run" });

    // A first-party activity + reaction owned by alice.
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: alice.id, dayKey: "2026-06-01" },
    });
    await prisma.reaction.create({
      data: { activityId: activity.id, userId: alice.id, kind: "CHEER" },
    });
    // An OAuth identity row.
    await prisma.identity.create({
      data: { userId: alice.id, provider: "GOOGLE", providerAccountId: "g-1" },
    });
    // A follow relationship (alice follows bob).
    const bob = await createUser({ handle: "bob" });
    await prisma.follow.create({
      data: { followerId: alice.id, followeeId: bob.id },
    });

    const result = await deleteAccount(alice.id);

    expect(result).toBeUndefined();
    expect(await prisma.user.findUnique({ where: { id: alice.id } })).toBeNull();
    // Cascaded children are gone.
    expect(await prisma.challenge.count({ where: { ownerId: alice.id } })).toBe(0);
    expect(await prisma.activity.count({ where: { userId: alice.id } })).toBe(0);
    expect(await prisma.reaction.count({ where: { userId: alice.id } })).toBe(0);
    expect(await prisma.identity.count({ where: { userId: alice.id } })).toBe(0);
    expect(await prisma.follow.count({ where: { followerId: alice.id } })).toBe(0);
    // Other users are untouched.
    expect(await prisma.user.findUnique({ where: { id: bob.id } })).not.toBeNull();
  });

  it("rejects when the user does not exist", async () => {
    await expect(deleteAccount("nonexistent")).rejects.toThrow();
  });
});
