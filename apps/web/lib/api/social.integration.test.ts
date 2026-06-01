// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  presignGet: vi.fn().mockResolvedValue("https://signed-get"),
  presignPut: vi.fn().mockResolvedValue("https://signed-put"),
  newMediaKey: vi.fn(),
  ensureBucket: vi.fn(),
}));

import { prisma, resetDb, createUser, createChallenge } from "../../test/db";
import { follow, unfollow, feed, react } from "./social";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("follow", () => {
  it("creates a follow edge", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await follow(alice.id, bob.id);

    const edge = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: alice.id, followeeId: bob.id } },
    });
    expect(edge).toBeTruthy();
    expect(edge!.followerId).toBe(alice.id);
    expect(edge!.followeeId).toBe(bob.id);
  });

  it("is idempotent (double follow does not throw)", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await follow(alice.id, bob.id);
    await follow(alice.id, bob.id); // should not throw

    const count = await prisma.follow.count({
      where: { followerId: alice.id, followeeId: bob.id },
    });
    expect(count).toBe(1);
  });

  it("throws 422 CANNOT_FOLLOW_SELF", async () => {
    const alice = await createUser({ handle: "alice" });
    await expect(follow(alice.id, alice.id)).rejects.toMatchObject({
      status: 422,
      code: "CANNOT_FOLLOW_SELF",
    });
  });
});

describe("unfollow", () => {
  it("removes a follow edge", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await follow(alice.id, bob.id);
    await unfollow(alice.id, bob.id);

    const edge = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: alice.id, followeeId: bob.id } },
    });
    expect(edge).toBeNull();
  });

  it("is idempotent when no edge exists", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    // Should not throw
    await expect(unfollow(alice.id, bob.id)).resolves.toBeUndefined();
  });
});

describe("feed", () => {
  it("returns activities from followed users with PUBLIC challenges, newest first", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const carol = await createUser({ handle: "carol" });

    // Alice follows Bob (not Carol)
    await follow(alice.id, bob.id);

    const bobChallenge = await createChallenge(bob.id, { visibility: "PUBLIC", goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const carolChallenge = await createChallenge(carol.id, { visibility: "PUBLIC", goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });

    // Bob logs two activities
    const a1 = await prisma.activity.create({
      data: { challengeId: bobChallenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });
    // small delay via different dayKey
    const a2 = await prisma.activity.create({
      data: { challengeId: bobChallenge.id, userId: bob.id, dayKey: "2026-06-02", done: true },
    });
    // Carol's activity (not followed)
    await prisma.activity.create({
      data: { challengeId: carolChallenge.id, userId: carol.id, dayKey: "2026-06-01", done: true },
    });

    const result = await feed(alice.id);

    // Only Bob's activities (not Carol's)
    const ids = result.map((a) => a.id);
    expect(ids).toContain(a1.id);
    expect(ids).toContain(a2.id);
    expect(ids).not.toContain((await prisma.activity.findFirst({ where: { userId: carol.id } }))!.id);

    // Includes challenge and user
    expect(result[0]!.challenge).toBeDefined();
    expect(result[0]!.user).toBeDefined();
  });

  it("includes FOLLOWERS-visibility activities from followed users", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await follow(alice.id, bob.id);

    const challenge = await createChallenge(bob.id, { visibility: "FOLLOWERS", goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    const result = await feed(alice.id);
    expect(result.map((a) => a.id)).toContain(activity.id);
  });

  it("excludes PRIVATE-visibility activities", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await follow(alice.id, bob.id);

    const challenge = await createChallenge(bob.id, { visibility: "PRIVATE", goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    const result = await feed(alice.id);
    expect(result.map((a) => a.id)).not.toContain(activity.id);
  });

  it("excludes activities from non-followed users", async () => {
    const alice = await createUser({ handle: "alice" });
    const carol = await createUser({ handle: "carol" });

    const challenge = await createChallenge(carol.id, { visibility: "PUBLIC", goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: carol.id, dayKey: "2026-06-01", done: true },
    });

    const result = await feed(alice.id);
    expect(result.map((a) => a.id)).not.toContain(activity.id);
  });

  it("returns empty array when viewer follows nobody", async () => {
    const alice = await createUser({ handle: "alice" });
    const result = await feed(alice.id);
    expect(result).toHaveLength(0);
  });

  it("includes cheerCount = count of CHEER reactions per activity", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const fan = await createUser({ handle: "carol" });

    await follow(alice.id, bob.id);

    const challenge = await createChallenge(bob.id, { visibility: "PUBLIC", goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    // Two cheers, one comment
    await prisma.reaction.create({ data: { activityId: activity.id, userId: alice.id, kind: "CHEER" } });
    await prisma.reaction.create({ data: { activityId: activity.id, userId: fan.id, kind: "CHEER" } });
    await prisma.reaction.create({ data: { activityId: activity.id, userId: fan.id, kind: "COMMENT", text: "Nice" } });

    const result = await feed(alice.id);
    const found = result.find((a) => a.id === activity.id);
    expect(found).toBeDefined();
    expect(found!.cheerCount).toBe(2);
  });

  it("includes hasPhoto = true when activity has media", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await follow(alice.id, bob.id);

    const challenge = await createChallenge(bob.id, { visibility: "PUBLIC", goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });
    await prisma.activityMedia.create({
      data: { activityId: activity.id, objectKey: `media/${bob.id}/img.jpg`, width: 800, height: 600, order: 0 },
    });

    const result = await feed(alice.id);
    const found = result.find((a) => a.id === activity.id);
    expect(found).toBeDefined();
    expect(found!.hasPhoto).toBe(true);
    expect(found!.media[0]!.url).toBe("https://signed-get");
  });

  it("includes hasPhoto = false when activity has no media", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });

    await follow(alice.id, bob.id);

    const challenge = await createChallenge(bob.id, { visibility: "PUBLIC", goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    const result = await feed(alice.id);
    const found = result.find((a) => a.id === activity.id);
    expect(found).toBeDefined();
    expect(found!.hasPhoto).toBe(false);
    expect(found!.media).toHaveLength(0);
    expect(found!.cheerCount).toBe(0);
  });
});

describe("react", () => {
  it("creates a CHEER reaction", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const challenge = await createChallenge(bob.id, { goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    const reaction = await react(alice.id, activity.id, "CHEER");
    expect(reaction.kind).toBe("CHEER");
    expect(reaction.text).toBeNull();
    expect(reaction.userId).toBe(alice.id);
    expect(reaction.activityId).toBe(activity.id);
  });

  it("creates a COMMENT reaction with text", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const challenge = await createChallenge(bob.id, { goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    const reaction = await react(alice.id, activity.id, "COMMENT", "Great job!");
    expect(reaction.kind).toBe("COMMENT");
    expect(reaction.text).toBe("Great job!");
  });

  it("throws 422 COMMENT_REQUIRES_TEXT for COMMENT without text", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const challenge = await createChallenge(bob.id, { goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    await expect(react(alice.id, activity.id, "COMMENT")).rejects.toMatchObject({
      status: 422,
      code: "COMMENT_REQUIRES_TEXT",
    });
  });

  it("throws 422 COMMENT_REQUIRES_TEXT for COMMENT with empty text", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const challenge = await createChallenge(bob.id, { goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    await expect(react(alice.id, activity.id, "COMMENT", "  ")).rejects.toMatchObject({
      status: 422,
      code: "COMMENT_REQUIRES_TEXT",
    });
  });

  it("throws 404 ACTIVITY_NOT_FOUND for missing activity", async () => {
    const alice = await createUser({ handle: "alice" });
    await expect(react(alice.id, "nonexistent", "CHEER")).rejects.toMatchObject({
      status: 404,
      code: "ACTIVITY_NOT_FOUND",
    });
  });

  it("CHEER ignores text even if provided", async () => {
    const alice = await createUser({ handle: "alice" });
    const bob = await createUser({ handle: "bob" });
    const challenge = await createChallenge(bob.id, { goalType: "BINARY", startDate: "2026-06-01", lengthDays: 50 });
    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: bob.id, dayKey: "2026-06-01", done: true },
    });

    const reaction = await react(alice.id, activity.id, "CHEER", "some text");
    // CHEER should not store text
    expect(reaction.text).toBeNull();
  });
});
