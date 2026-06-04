// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Object storage is mocked: this is a DB integration test, and we assert the
// deletion flow calls into storage with the right keys (no real S3/Azure).
// userMediaPrefix is the real (pure) implementation so the in-prefix security
// filter behaves exactly as it does in production.
const deleteObject = vi.fn().mockResolvedValue(undefined);
const deleteUserMedia = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/storage", () => ({
  deleteObject: (key: string) => deleteObject(key),
  deleteUserMedia: (uid: string) => deleteUserMedia(uid),
  userMediaPrefix: (uid: string) => `media/${uid}/`,
}));

import { prisma, resetDb, createUser } from "../../test/db";
import {
  getAccount,
  updateAccount,
  deleteAccount,
  exportAccountData,
} from "./account";

beforeEach(() => {
  vi.clearAllMocks();
  deleteObject.mockResolvedValue(undefined);
  deleteUserMedia.mockResolvedValue(undefined);
  return resetDb();
});

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

  it("deletes the user's uploaded media blobs (day photos, activity photos, recaps) before removing the DB row", async () => {
    const { createChallenge } = await import("../../test/db");
    const alice = await createUser({ handle: "alice" });
    const challenge = await createChallenge(alice.id, { title: "Run" });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: alice.id, dayKey: "2026-06-01" },
    });
    // One of each media kind, all under media/<uid>/.
    await prisma.activityMedia.create({
      data: {
        activityId: activity.id,
        objectKey: `media/${alice.id}/act-1.jpg`,
        width: 100,
        height: 100,
      },
    });
    await prisma.project50DayMedia.create({
      data: {
        challengeId: challenge.id,
        dayKey: "2026-06-01",
        objectKey: `media/${alice.id}/day-1.jpg`,
        width: 100,
        height: 100,
      },
    });
    await prisma.recap.create({
      data: {
        challengeId: challenge.id,
        kind: "DAY",
        objectKey: `media/${alice.id}/recap-1.mp4`,
      },
    });

    await deleteAccount(alice.id);

    // Every recorded objectKey was deleted explicitly.
    const deletedKeys = deleteObject.mock.calls.map((c) => c[0]).sort();
    expect(deletedKeys).toEqual(
      [
        `media/${alice.id}/act-1.jpg`,
        `media/${alice.id}/day-1.jpg`,
        `media/${alice.id}/recap-1.mp4`,
      ].sort(),
    );
    // Plus the belt-and-suspenders prefix sweep for this user.
    expect(deleteUserMedia).toHaveBeenCalledOnce();
    expect(deleteUserMedia).toHaveBeenCalledWith(alice.id);
    // The DB row is gone.
    expect(await prisma.user.findUnique({ where: { id: alice.id } })).toBeNull();
  });

  it("only deletes THIS user's media, never another user's blobs", async () => {
    const { createChallenge } = await import("../../test/db");
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const aliceCh = await createChallenge(alice.id, { title: "Alice" });
    const bobCh = await createChallenge(bob.id, { title: "Bob" });
    await prisma.recap.create({
      data: {
        challengeId: aliceCh.id,
        kind: "DAY",
        objectKey: `media/${alice.id}/a.mp4`,
      },
    });
    await prisma.recap.create({
      data: {
        challengeId: bobCh.id,
        kind: "DAY",
        objectKey: `media/${bob.id}/b.mp4`,
      },
    });

    await deleteAccount(alice.id);

    const deletedKeys = deleteObject.mock.calls.map((c) => c[0]);
    expect(deletedKeys).toEqual([`media/${alice.id}/a.mp4`]);
    expect(deleteUserMedia).toHaveBeenCalledOnce();
    expect(deleteUserMedia).toHaveBeenCalledWith(alice.id);
    // Bob's media row and account are untouched.
    expect(await prisma.recap.count({ where: { challengeId: bobCh.id } })).toBe(1);
  });

  it("never exact-deletes a DB key outside the user's own media prefix (only in-prefix keys + the sweep)", async () => {
    const { createChallenge } = await import("../../test/db");
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const challenge = await createChallenge(alice.id, { title: "Run" });
    // A legitimate in-prefix key on one of alice's rows.
    await prisma.recap.create({
      data: {
        challengeId: challenge.id,
        kind: "DAY",
        objectKey: `media/${alice.id}/ok.mp4`,
      },
    });
    // A crafted/buggy row on alice's challenge whose objectKey points OUTSIDE
    // her prefix (another user's media + an arbitrary bucket path).
    await prisma.recap.create({
      data: {
        challengeId: challenge.id,
        kind: "WEEK",
        objectKey: `media/${bob.id}/victim.mp4`,
      },
    });
    await prisma.project50DayMedia.create({
      data: {
        challengeId: challenge.id,
        dayKey: "2026-06-01",
        objectKey: "backups/db.sql",
        width: 1,
        height: 1,
      },
    });

    await deleteAccount(alice.id);

    // Only the in-prefix key is exact-deleted; the out-of-prefix keys are skipped.
    const deletedKeys = deleteObject.mock.calls.map((c) => c[0]);
    expect(deletedKeys).toEqual([`media/${alice.id}/ok.mp4`]);
    expect(deletedKeys).not.toContain(`media/${bob.id}/victim.mp4`);
    expect(deletedKeys).not.toContain("backups/db.sql");
    // The prefix sweep still runs (removes all of alice's legitimate media).
    expect(deleteUserMedia).toHaveBeenCalledOnce();
    expect(deleteUserMedia).toHaveBeenCalledWith(alice.id);
    expect(await prisma.user.findUnique({ where: { id: alice.id } })).toBeNull();
  });

  it("completes (deletes the user + sweeps the prefix) even if a single blob delete throws", async () => {
    const { createChallenge } = await import("../../test/db");
    const alice = await createUser({ handle: "alice" });
    const challenge = await createChallenge(alice.id, { title: "Run" });
    await prisma.recap.create({
      data: {
        challengeId: challenge.id,
        kind: "DAY",
        objectKey: `media/${alice.id}/boom.mp4`,
      },
    });
    deleteObject.mockRejectedValueOnce(new Error("storage 500"));

    await expect(deleteAccount(alice.id)).resolves.toBeUndefined();

    // The blob failure is swallowed; the prefix sweep still runs and the DB row
    // (already deleted before storage cleanup) stays gone.
    expect(deleteUserMedia).toHaveBeenCalledOnce();
    expect(deleteUserMedia).toHaveBeenCalledWith(alice.id);
    expect(await prisma.user.findUnique({ where: { id: alice.id } })).toBeNull();
  });

  it("still deletes the user when the prefix sweep itself throws", async () => {
    const alice = await createUser({ handle: "alice" });
    deleteUserMedia.mockRejectedValueOnce(new Error("list failed"));

    await expect(deleteAccount(alice.id)).resolves.toBeUndefined();

    expect(await prisma.user.findUnique({ where: { id: alice.id } })).toBeNull();
  });

  it("sweeps the prefix even when the user has no recorded media", async () => {
    const alice = await createUser({ handle: "alice" });

    await deleteAccount(alice.id);

    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteUserMedia).toHaveBeenCalledOnce();
    expect(deleteUserMedia).toHaveBeenCalledWith(alice.id);
  });

  it("rejects when the user does not exist, and touches NO storage", async () => {
    await expect(deleteAccount("nonexistent")).rejects.toThrow();
    // Storage cleanup runs only AFTER a successful DB delete, so a failed
    // delete (stale/nonexistent uid) must never destroy any blobs.
    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteUserMedia).not.toHaveBeenCalled();
  });

  it("does not touch storage when the DB delete fails after keys are collected", async () => {
    const { createChallenge } = await import("../../test/db");
    const alice = await createUser({ handle: "alice" });
    const challenge = await createChallenge(alice.id, { title: "Run" });
    await prisma.recap.create({
      data: {
        challengeId: challenge.id,
        kind: "DAY",
        objectKey: `media/${alice.id}/x.mp4`,
      },
    });
    // Simulate a transient DB failure on the delete itself.
    const spy = vi
      .spyOn(prisma.user, "delete")
      .mockRejectedValueOnce(new Error("db down"));

    await expect(deleteAccount(alice.id)).rejects.toThrow("db down");

    // No blobs deleted; the account row is still present.
    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteUserMedia).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(await prisma.user.findUnique({ where: { id: alice.id } })).not.toBeNull();
  });
});

describe("exportAccountData", () => {
  it("throws 404 ACCOUNT_NOT_FOUND for unknown user", async () => {
    await expect(exportAccountData("nonexistent")).rejects.toMatchObject({
      status: 404,
      code: "ACCOUNT_NOT_FOUND",
    });
  });

  it("includes the user's profile and follow edges in both directions", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });
    const bob = await createUser({ handle: "bob" });
    const carol = await createUser({ handle: "carol" });
    // alice follows bob; carol follows alice.
    await prisma.follow.create({
      data: { followerId: alice.id, followeeId: bob.id },
    });
    await prisma.follow.create({
      data: { followerId: carol.id, followeeId: alice.id },
    });

    const data = await exportAccountData(alice.id);

    expect(data.profile).toMatchObject({
      id: alice.id,
      handle: "alice",
      displayName: "Alice A",
      avatarUrl: null,
      isAdmin: false,
    });
    expect(typeof data.profile.createdAt).toBe("string");
    expect(typeof data.exportedAt).toBe("string");
    expect(data.following).toEqual([
      { followeeId: bob.id, createdAt: expect.any(String) },
    ]);
    expect(data.followers).toEqual([
      { followerId: carol.id, createdAt: expect.any(String) },
    ]);
  });

  it("includes the user's challenges with nested children and first-party activities and reactions", async () => {
    const { createChallenge } = await import("../../test/db");
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });
    const challenge = await createChallenge(alice.id, {
      title: "Run",
      goalType: "TARGET",
      dailyTarget: 60,
    });

    const activity = await prisma.activity.create({
      data: {
        challengeId: challenge.id,
        userId: alice.id,
        dayKey: "2026-06-01",
        activityType: "run",
        amount: 5,
        done: true,
        note: "felt great",
        mood: 4,
      },
    });
    await prisma.dayStatus.create({
      data: {
        challengeId: challenge.id,
        dayKey: "2026-06-01",
        totalAmount: 5,
        completed: true,
      },
    });
    await prisma.milestone.create({
      data: { challengeId: challenge.id, kind: "COMPLETED_7" },
    });
    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "DAY", objectKey: "recaps/x.mp4" },
    });
    await prisma.ruleCheck.create({
      data: {
        challengeId: challenge.id,
        dayKey: "2026-06-01",
        ruleId: 1,
        done: true,
      },
    });
    await prisma.dayJournal.create({
      data: {
        challengeId: challenge.id,
        dayKey: "2026-06-01",
        wins: "ran 5k",
        lessons: "start earlier",
      },
    });
    await prisma.reaction.create({
      data: {
        activityId: activity.id,
        userId: alice.id,
        kind: "COMMENT",
        text: "nice",
      },
    });

    const data = await exportAccountData(alice.id);

    expect(data.challenges).toHaveLength(1);
    const c = data.challenges[0]!;
    expect(c).toMatchObject({
      id: challenge.id,
      title: "Run",
      goalType: "TARGET",
      dailyTarget: 60,
      kind: "STANDARD",
      status: "ACTIVE",
      visibility: "PUBLIC",
    });
    expect(c.activities).toEqual([
      {
        id: activity.id,
        dayKey: "2026-06-01",
        activityType: "run",
        amount: 5,
        done: true,
        note: "felt great",
        mood: 4,
        createdAt: expect.any(String),
      },
    ]);
    expect(c.dayStatuses).toEqual([
      { dayKey: "2026-06-01", totalAmount: 5, completed: true },
    ]);
    expect(c.milestones).toEqual([
      { kind: "COMPLETED_7", earnedAt: expect.any(String) },
    ]);
    expect(c.recaps).toEqual([
      { id: expect.any(String), kind: "DAY", createdAt: expect.any(String) },
    ]);
    expect(c.ruleChecks).toEqual([
      {
        id: expect.any(String),
        dayKey: "2026-06-01",
        ruleId: 1,
        done: true,
        createdAt: expect.any(String),
      },
    ]);
    expect(c.dayJournals).toEqual([
      {
        id: expect.any(String),
        dayKey: "2026-06-01",
        wins: "ran 5k",
        lessons: "start earlier",
        updatedAt: expect.any(String),
        createdAt: expect.any(String),
      },
    ]);

    // First-party activities and reactions appear at the top level too.
    expect(data.activities).toEqual([
      {
        id: activity.id,
        challengeId: challenge.id,
        dayKey: "2026-06-01",
        activityType: "run",
        amount: 5,
        done: true,
        note: "felt great",
        mood: 4,
        createdAt: expect.any(String),
      },
    ]);
    expect(data.reactions).toEqual([
      {
        id: expect.any(String),
        activityId: activity.id,
        kind: "COMMENT",
        text: "nice",
        createdAt: expect.any(String),
      },
    ]);
  });

  it("excludes other users' data", async () => {
    const { createChallenge } = await import("../../test/db");
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    // Bob's own challenge + activity + reaction.
    const bobChallenge = await createChallenge(bob.id, { title: "Bob run" });
    const bobActivity = await prisma.activity.create({
      data: { challengeId: bobChallenge.id, userId: bob.id, dayKey: "2026-06-01" },
    });
    await prisma.reaction.create({
      data: { activityId: bobActivity.id, userId: bob.id, kind: "CHEER" },
    });

    const data = await exportAccountData(alice.id);

    expect(data.challenges).toEqual([]);
    expect(data.activities).toEqual([]);
    expect(data.reactions).toEqual([]);
    // Sanity: bob's export does contain his own data.
    const bobData = await exportAccountData(bob.id);
    expect(bobData.challenges).toHaveLength(1);
    expect(bobData.activities).toHaveLength(1);
    expect(bobData.reactions).toHaveLength(1);
  });
});
