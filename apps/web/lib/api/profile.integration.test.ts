// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll } from "vitest";

import { prisma, resetDb, createUser, createChallenge } from "../../test/db";
import { clearCache } from "../cache";
import { getPublicProfile, invalidatePublicProfile } from "./profile";

beforeEach(async () => {
  await resetDb();
  // The public-profile core is cached by handle; clear it so handles reused
  // across tests (e.g. "alice") never serve a previous test's data.
  await clearCache();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getPublicProfile", () => {
  it("returns null for an unknown handle", async () => {
    const result = await getPublicProfile("nobody");
    expect(result).toBeNull();
  });

  it("returns id, handle and displayName for a known user", async () => {
    const alice = await createUser({ handle: "alice", displayName: "Alice A" });

    const result = await getPublicProfile("alice");

    expect(result).not.toBeNull();
    expect(result!.id).toBe(alice.id);
    expect(result!.handle).toBe("alice");
    expect(result!.displayName).toBe("Alice A");
  });

  it("reports isFollowing=false when there is no viewer", async () => {
    await createUser({ handle: "alice" });

    const result = await getPublicProfile("alice");

    expect(result!.isFollowing).toBe(false);
  });

  it("reports isFollowing=true when the viewer follows the profile user", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    await prisma.follow.create({
      data: { followerId: bob.id, followeeId: alice.id },
    });

    const result = await getPublicProfile("alice", bob.id);

    expect(result!.isFollowing).toBe(true);
  });

  it("reports isFollowing=false when the viewer does not follow the profile user", async () => {
    await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    const result = await getPublicProfile("alice", bob.id);

    expect(result!.isFollowing).toBe(false);
  });

  it("reports isFollowing=false when the viewer is the profile user (self)", async () => {
    const alice = await createUser({ handle: "alice" });

    const result = await getPublicProfile("alice", alice.id);

    expect(result!.isFollowing).toBe(false);
  });

  it("includes only PUBLIC challenges with id, title, and goalType", async () => {
    const alice = await createUser({ handle: "alice" });
    const pub = await createChallenge(alice.id, {
      title: "Run 5K",
      goalType: "TARGET",
      visibility: "PUBLIC",
    });
    await createChallenge(alice.id, {
      title: "Secret journal",
      goalType: "BINARY",
      visibility: "PRIVATE",
    });
    await createChallenge(alice.id, {
      title: "Friends only",
      goalType: "BINARY",
      visibility: "FOLLOWERS",
    });

    const result = await getPublicProfile("alice");

    expect(result!.challenges).toHaveLength(1);
    expect(result!.challenges[0]).toEqual({
      id: pub.id,
      title: "Run 5K",
      goalType: "TARGET",
    });
  });

  it("orders public challenges most recent first", async () => {
    const alice = await createUser({ handle: "alice" });
    const first = await createChallenge(alice.id, {
      title: "First",
      visibility: "PUBLIC",
    });
    // Force a later createdAt so ordering is deterministic.
    const second = await prisma.challenge.create({
      data: {
        ownerId: alice.id,
        title: "Second",
        goalType: "BINARY",
        startDate: "2026-06-02",
        lengthDays: 50,
        timezone: "UTC",
        visibility: "PUBLIC",
        createdAt: new Date(Date.now() + 1000),
      },
    });

    const result = await getPublicProfile("alice");

    expect(result!.challenges.map((c) => c.id)).toEqual([second.id, first.id]);
  });

  it("excludes another user's challenges", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    await createChallenge(bob.id, { title: "Bob's", visibility: "PUBLIC" });
    const aliceChallenge = await createChallenge(alice.id, {
      title: "Alice's",
      visibility: "PUBLIC",
    });

    const result = await getPublicProfile("alice");

    expect(result!.challenges).toHaveLength(1);
    expect(result!.challenges[0]!.id).toBe(aliceChallenge.id);
  });

  it("returns an empty challenge list when the user has no public challenges", async () => {
    const alice = await createUser({ handle: "alice" });
    await createChallenge(alice.id, { visibility: "PRIVATE" });

    const result = await getPublicProfile("alice");

    expect(result!.challenges).toEqual([]);
  });

  describe("caching", () => {
    it("serves the cached public core: a later display-name change is not seen until invalidation", async () => {
      await createUser({ handle: "alice", displayName: "Alice A" });

      // Prime the cache.
      const first = await getPublicProfile("alice");
      expect(first!.displayName).toBe("Alice A");

      // Mutate the DB directly (bypassing any invalidation).
      await prisma.user.update({
        where: { handle: "alice" },
        data: { displayName: "Alice B" },
      });

      // Still served from cache -> old value.
      const cachedResult = await getPublicProfile("alice");
      expect(cachedResult!.displayName).toBe("Alice A");

      // After invalidation the fresh value is returned.
      await invalidatePublicProfile("alice");
      const fresh = await getPublicProfile("alice");
      expect(fresh!.displayName).toBe("Alice B");
    });

    it("computes isFollowing fresh on every call even when the core is cached", async () => {
      const alice = await createUser({ handle: "alice" });
      const bob = await createUser({ handle: "bob" });

      // Prime the cache (no follow yet).
      const before = await getPublicProfile("alice", bob.id);
      expect(before!.isFollowing).toBe(false);

      // Create the follow edge after the core was cached.
      await prisma.follow.create({
        data: { followerId: bob.id, followeeId: alice.id },
      });

      // Core is still cached, but isFollowing reflects the new edge.
      const after = await getPublicProfile("alice", bob.id);
      expect(after!.isFollowing).toBe(true);
    });

    it("does not cache a null result for an unknown handle", async () => {
      // Miss for a not-yet-existing handle.
      expect(await getPublicProfile("late")).toBeNull();

      // Create the user; the next read must reflect it (null was not cached).
      await createUser({ handle: "late", displayName: "Late L" });
      const result = await getPublicProfile("late");
      expect(result!.displayName).toBe("Late L");
    });
  });
});
