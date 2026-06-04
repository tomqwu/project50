// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

// challenges.ts → http.ts → session.ts → @/auth (next-auth) needs next/server — not available in vitest node env.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  presignGet: vi.fn().mockResolvedValue("https://signed-get"),
  presignPut: vi.fn().mockResolvedValue("https://signed-put"),
  newMediaKey: vi.fn(),
  ensureBucket: vi.fn(),
}));

import { prisma, resetDb, createUser, createChallenge as seedChallenge } from "../../test/db";
import {
  createChallenge,
  listChallenges,
  getChallenge,
  getMilestones,
  getChallengeByShareId,
  updateChallenge,
  deleteChallenge,
} from "./challenges";
import { HttpError } from "./http";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createChallenge", () => {
  it("creates and returns a TARGET challenge", async () => {
    const user = await createUser({ handle: "alice" });
    const challenge = await createChallenge(user.id, {
      title: "Run 5K",
      goalType: "TARGET",
      dailyTarget: 5,
      unit: "km",
      startDate: "2026-06-01",
      lengthDays: 50,
      timezone: "UTC",
      visibility: "PUBLIC",
    });
    expect(challenge.id).toBeTruthy();
    expect(challenge.title).toBe("Run 5K");
    expect(challenge.goalType).toBe("TARGET");
    expect(challenge.dailyTarget).toBe(5);
    expect(challenge.unit).toBe("km");
    expect(challenge.ownerId).toBe(user.id);

    const found = await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(found.title).toBe("Run 5K");
  });

  it("creates and returns a BINARY challenge", async () => {
    const user = await createUser({ handle: "bob" });
    const challenge = await createChallenge(user.id, {
      title: "Meditate",
      goalType: "BINARY",
      startDate: "2026-06-01",
    });
    expect(challenge.goalType).toBe("BINARY");
    expect(challenge.dailyTarget).toBeNull();
    expect(challenge.unit).toBeNull();
  });

  it("normalizes a malformed timezone to UTC before storing", async () => {
    const user = await createUser({ handle: "tzbad" });
    const challenge = await createChallenge(user.id, {
      title: "Bad TZ",
      goalType: "BINARY",
      startDate: "2026-06-01",
      timezone: "Not/A_Zone",
    });
    expect(challenge.timezone).toBe("UTC");
  });

  it("defaults a blank timezone to UTC", async () => {
    const user = await createUser({ handle: "tzblank" });
    const challenge = await createChallenge(user.id, {
      title: "Blank TZ",
      goalType: "BINARY",
      startDate: "2026-06-01",
      timezone: "   ",
    });
    expect(challenge.timezone).toBe("UTC");
  });

  it("throws 422 INVALID_CHALLENGE when title is empty", async () => {
    const user = await createUser({ handle: "carol" });
    await expect(
      createChallenge(user.id, {
        title: "",
        goalType: "TARGET",
        dailyTarget: 10,
        unit: "min",
        startDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CHALLENGE" });
  });

  it("throws 422 INVALID_CHALLENGE when goalType is invalid", async () => {
    const user = await createUser({ handle: "dave" });
    await expect(
      createChallenge(user.id, {
        title: "Something",
        goalType: "INVALID",
        startDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CHALLENGE" });
  });

  it("throws 422 INVALID_CHALLENGE when TARGET missing dailyTarget", async () => {
    const user = await createUser({ handle: "eve" });
    await expect(
      createChallenge(user.id, {
        title: "Run",
        goalType: "TARGET",
        unit: "km",
        startDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CHALLENGE" });
  });

  it("throws 422 INVALID_CHALLENGE when TARGET has dailyTarget=0", async () => {
    const user = await createUser({ handle: "frank" });
    await expect(
      createChallenge(user.id, {
        title: "Run",
        goalType: "TARGET",
        dailyTarget: 0,
        unit: "km",
        startDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CHALLENGE" });
  });

  it("throws 422 INVALID_CHALLENGE when TARGET missing unit", async () => {
    const user = await createUser({ handle: "grace" });
    await expect(
      createChallenge(user.id, {
        title: "Run",
        goalType: "TARGET",
        dailyTarget: 5,
        startDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CHALLENGE" });
  });

  it("INVALID_CHALLENGE detail includes unit error for missing unit", async () => {
    const user = await createUser({ handle: "henry" });
    const err = await createChallenge(user.id, {
      title: "Run",
      goalType: "TARGET",
      dailyTarget: 5,
      startDate: "2026-06-01",
    }).catch((e: HttpError) => e);
    expect(err).toBeInstanceOf(HttpError);
    const detail = (err as HttpError).detail as string[];
    expect(detail.some((e) => e.includes("unit"))).toBe(true);
  });

  it("INVALID_CHALLENGE detail includes dailyTarget error when missing", async () => {
    const user = await createUser({ handle: "iris" });
    const err = await createChallenge(user.id, {
      title: "Run",
      goalType: "TARGET",
      unit: "km",
      startDate: "2026-06-01",
    }).catch((e: HttpError) => e);
    expect(err).toBeInstanceOf(HttpError);
    const detail = (err as HttpError).detail as string[];
    expect(detail.some((e) => e.includes("dailyTarget"))).toBe(true);
  });
});

describe("listChallenges", () => {
  it("returns only the owner's challenges, newest first", async () => {
    const user = await createUser({ handle: "alice" });
    const other = await createUser({ handle: "bob" });

    const c1 = await seedChallenge(user.id, { title: "First" });
    const c2 = await seedChallenge(user.id, { title: "Second" });
    await seedChallenge(other.id, { title: "Other" });

    const result = await listChallenges(user.id);
    expect(result).toHaveLength(2);
    // Newest first: c2 created after c1
    expect(result[0]!.id).toBe(c2.id);
    expect(result[1]!.id).toBe(c1.id);
    // No other user's challenges
    expect(result.every((c) => c.ownerId === user.id)).toBe(true);
  });

  it("returns empty array when owner has no challenges", async () => {
    const user = await createUser({ handle: "alice" });
    const result = await listChallenges(user.id);
    expect(result).toHaveLength(0);
  });
});

describe("getChallenge", () => {
  it("returns a PUBLIC challenge for any viewer + streak computed", async () => {
    const owner = await createUser({ handle: "alice" });
    const viewer = await createUser({ handle: "bob" });
    const challenge = await seedChallenge(owner.id, {
      visibility: "PUBLIC",
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    // Seed some completed dayStatuses
    await prisma.dayStatus.createMany({
      data: [
        { challengeId: challenge.id, dayKey: "2026-06-01", totalAmount: 0, completed: true },
        { challengeId: challenge.id, dayKey: "2026-06-02", totalAmount: 0, completed: true },
        { challengeId: challenge.id, dayKey: "2026-06-03", totalAmount: 0, completed: true },
      ],
    });

    const result = await getChallenge(challenge.id, viewer.id);
    expect(result.id).toBe(challenge.id);
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
    expect(Array.isArray(result.dayStatuses)).toBe(true);
  });

  it("returns 0 streaks when no completed days", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "PUBLIC" });

    const result = await getChallenge(challenge.id, owner.id);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
  });

  it("throws 404 when challenge does not exist", async () => {
    const viewer = await createUser({ handle: "alice" });
    await expect(getChallenge("nonexistent-id", viewer.id)).rejects.toMatchObject({
      status: 404,
      code: "CHALLENGE_NOT_FOUND",
    });
  });

  it("throws 404 for PRIVATE challenge if viewer is not owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const viewer = await createUser({ handle: "bob" });
    const challenge = await seedChallenge(owner.id, { visibility: "PRIVATE" });

    await expect(getChallenge(challenge.id, viewer.id)).rejects.toMatchObject({
      status: 404,
      code: "CHALLENGE_NOT_FOUND",
    });
  });

  it("allows owner to view PRIVATE challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "PRIVATE" });

    const result = await getChallenge(challenge.id, owner.id);
    expect(result.id).toBe(challenge.id);
  });

  it("shows FOLLOWERS challenge to a follower", async () => {
    const owner = await createUser({ handle: "alice" });
    const follower = await createUser({ handle: "bob" });
    const challenge = await seedChallenge(owner.id, { visibility: "FOLLOWERS" });

    // Create follow edge
    await prisma.follow.create({
      data: { followerId: follower.id, followeeId: owner.id },
    });

    const result = await getChallenge(challenge.id, follower.id);
    expect(result.id).toBe(challenge.id);
  });

  it("throws 404 for FOLLOWERS challenge to a stranger", async () => {
    const owner = await createUser({ handle: "alice" });
    const stranger = await createUser({ handle: "carol" });
    const challenge = await seedChallenge(owner.id, { visibility: "FOLLOWERS" });

    await expect(getChallenge(challenge.id, stranger.id)).rejects.toMatchObject({ status: 404 });
  });

  it("allows owner to see FOLLOWERS challenge even without following themselves", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "FOLLOWERS" });

    const result = await getChallenge(challenge.id, owner.id);
    expect(result.id).toBe(challenge.id);
  });

  it("returns badges = milestones.length", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "PUBLIC" });

    // Seed 2 milestones
    await prisma.milestone.create({ data: { challengeId: challenge.id, kind: "COMPLETED_7" } });
    await prisma.milestone.create({ data: { challengeId: challenge.id, kind: "STREAK_7" } });

    const result = await getChallenge(challenge.id, owner.id);
    expect(result.badges).toBe(2);
  });

  it("returns badges = 0 when no milestones", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "PUBLIC" });

    const result = await getChallenge(challenge.id, owner.id);
    expect(result.badges).toBe(0);
  });

  it("returns cheering = count of CHEER reactions on owner's activities for this challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const fan1 = await createUser({ handle: "bob" });
    const fan2 = await createUser({ handle: "carol" });
    const challenge = await seedChallenge(owner.id, {
      visibility: "PUBLIC",
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: owner.id, dayKey: "2026-06-01", done: true },
    });

    // Two cheers
    await prisma.reaction.create({
      data: { activityId: activity.id, userId: fan1.id, kind: "CHEER" },
    });
    await prisma.reaction.create({
      data: { activityId: activity.id, userId: fan2.id, kind: "CHEER" },
    });
    // A comment (should not count)
    await prisma.reaction.create({
      data: { activityId: activity.id, userId: fan1.id, kind: "COMMENT", text: "Nice!" },
    });

    const result = await getChallenge(challenge.id, owner.id);
    expect(result.cheering).toBe(2);
  });

  it("returns cheering = 0 when no CHEER reactions", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "PUBLIC" });

    const result = await getChallenge(challenge.id, owner.id);
    expect(result.cheering).toBe(0);
  });

  it("does not count CHEERs from another challenge's activities", async () => {
    const owner = await createUser({ handle: "alice" });
    const fan = await createUser({ handle: "bob" });
    const challenge1 = await seedChallenge(owner.id, {
      visibility: "PUBLIC",
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });
    const challenge2 = await seedChallenge(owner.id, {
      visibility: "PUBLIC",
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    const activity2 = await prisma.activity.create({
      data: { challengeId: challenge2.id, userId: owner.id, dayKey: "2026-06-01", done: true },
    });
    await prisma.reaction.create({
      data: { activityId: activity2.id, userId: fan.id, kind: "CHEER" },
    });

    const result = await getChallenge(challenge1.id, owner.id);
    expect(result.cheering).toBe(0);
  });

  it("returns activities with media and signed URLs", async () => {
    const { presignGet } = await import("@/lib/storage");
    vi.mocked(presignGet).mockResolvedValue("https://signed-get");

    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, {
      visibility: "PUBLIC",
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });

    const activity = await prisma.activity.create({
      data: { challengeId: challenge.id, userId: owner.id, dayKey: "2026-06-01", done: true },
    });
    await prisma.activityMedia.create({
      data: {
        activityId: activity.id,
        objectKey: `media/${owner.id}/img.jpg`,
        width: 800,
        height: 600,
        order: 0,
      },
    });

    const result = await getChallenge(challenge.id, owner.id);
    const foundActivity = result.activities.find((a) => a.id === activity.id);
    expect(foundActivity).toBeDefined();
    expect(foundActivity!.media).toHaveLength(1);
    expect(foundActivity!.media[0]!.url).toBe("https://signed-get");
    expect(foundActivity!.media[0]!.objectKey).toBe(`media/${owner.id}/img.jpg`);
  });
});

describe("getChallengeByShareId", () => {
  it("returns challenge with dayStatuses and milestones for a PUBLIC challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "PUBLIC" });

    // Seed a dayStatus
    await prisma.dayStatus.create({
      data: { challengeId: challenge.id, dayKey: "2026-06-01", totalAmount: 5, completed: true },
    });

    // Seed a milestone
    await prisma.milestone.create({
      data: { challengeId: challenge.id, kind: "COMPLETED_7" },
    });

    const result = await getChallengeByShareId(challenge.shareId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(challenge.id);
    expect(result!.visibility).toBe("PUBLIC");
    expect(Array.isArray(result!.dayStatuses)).toBe(true);
    expect(result!.dayStatuses.length).toBe(1);
    expect(Array.isArray(result!.milestones)).toBe(true);
    expect(result!.milestones.length).toBe(1);
    expect(result!.milestones[0]!.kind).toBe("COMPLETED_7");
  });

  it("returns null for FOLLOWERS challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "FOLLOWERS" });
    const result = await getChallengeByShareId(challenge.shareId);
    expect(result).toBeNull();
  });

  it("returns null for PRIVATE challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { visibility: "PRIVATE" });
    const result = await getChallengeByShareId(challenge.shareId);
    expect(result).toBeNull();
  });

  it("returns null when shareId does not exist", async () => {
    const result = await getChallengeByShareId("nonexistent-share-id");
    expect(result).toBeNull();
  });
});

describe("updateChallenge", () => {
  it("updates editable fields (title, unit, dailyTarget, visibility) for the owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, {
      title: "Old",
      goalType: "TARGET",
      dailyTarget: 5,
      visibility: "PUBLIC",
    });

    const updated = await updateChallenge(challenge.id, owner.id, {
      title: "New title",
      unit: "miles",
      dailyTarget: 10,
      visibility: "PRIVATE",
    });

    expect(updated.title).toBe("New title");
    expect(updated.unit).toBe("miles");
    expect(updated.dailyTarget).toBe(10);
    expect(updated.visibility).toBe("PRIVATE");

    const found = await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(found.title).toBe("New title");
  });

  it("trims the title", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { title: "Old" });
    const updated = await updateChallenge(challenge.id, owner.id, { title: "  Spaced  " });
    expect(updated.title).toBe("Spaced");
  });

  it("trims the unit", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { goalType: "TARGET", dailyTarget: 5 });
    const updated = await updateChallenge(challenge.id, owner.id, { unit: "  km  " });
    expect(updated.unit).toBe("km");
  });

  it("ignores non-editable fields in the patch", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { title: "Old" });
    const updated = await updateChallenge(challenge.id, owner.id, {
      title: "Renamed",
      // @ts-expect-error — ownerId is not an editable field
      ownerId: "someone-else",
      goalType: "BINARY",
    });
    expect(updated.title).toBe("Renamed");
    expect(updated.ownerId).toBe(owner.id);
    expect(updated.goalType).toBe(challenge.goalType);
  });

  it("applies only the provided fields (partial patch)", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { title: "Keep", visibility: "PUBLIC" });
    const updated = await updateChallenge(challenge.id, owner.id, { visibility: "FOLLOWERS" });
    expect(updated.title).toBe("Keep");
    expect(updated.visibility).toBe("FOLLOWERS");
  });

  it("throws 404 when the challenge does not exist", async () => {
    const owner = await createUser({ handle: "alice" });
    await expect(updateChallenge("nonexistent-id", owner.id, { title: "x" })).rejects.toMatchObject(
      { status: 404, code: "CHALLENGE_NOT_FOUND" },
    );
  });

  it("throws 404 when the requester is not the owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const stranger = await createUser({ handle: "bob" });
    const challenge = await seedChallenge(owner.id, { title: "Old" });
    await expect(
      updateChallenge(challenge.id, stranger.id, { title: "Hacked" }),
    ).rejects.toMatchObject({ status: 404, code: "CHALLENGE_NOT_FOUND" });

    const found = await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(found.title).toBe("Old");
  });

  it("throws 422 when title is blank", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { title: "Old" });
    await expect(updateChallenge(challenge.id, owner.id, { title: "   " })).rejects.toMatchObject({
      status: 422,
      code: "INVALID_CHALLENGE",
    });
  });

  it("throws 422 when unit is blank", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { goalType: "TARGET", dailyTarget: 5 });
    await expect(updateChallenge(challenge.id, owner.id, { unit: "   " })).rejects.toMatchObject({
      status: 422,
      code: "INVALID_CHALLENGE",
    });
  });

  it("throws 422 when dailyTarget <= 0", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { goalType: "TARGET", dailyTarget: 5 });
    await expect(updateChallenge(challenge.id, owner.id, { dailyTarget: 0 })).rejects.toMatchObject(
      { status: 422, code: "INVALID_CHALLENGE" },
    );
  });

  it("throws 422 for an invalid visibility value", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, { title: "Old" });
    await expect(
      updateChallenge(challenge.id, owner.id, { visibility: "NONSENSE" }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CHALLENGE" });
  });
});

describe("deleteChallenge", () => {
  it("deletes the owner's challenge and cascades", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id, {
      goalType: "BINARY",
      startDate: "2026-06-01",
      lengthDays: 50,
    });
    await prisma.activity.create({
      data: { challengeId: challenge.id, userId: owner.id, dayKey: "2026-06-01", done: true },
    });

    const result = await deleteChallenge(challenge.id, owner.id);
    expect(result).toBeUndefined();

    const found = await prisma.challenge.findUnique({ where: { id: challenge.id } });
    expect(found).toBeNull();
    const activities = await prisma.activity.findMany({ where: { challengeId: challenge.id } });
    expect(activities).toHaveLength(0);
  });

  it("throws 404 when the challenge does not exist", async () => {
    const owner = await createUser({ handle: "alice" });
    await expect(deleteChallenge("nonexistent-id", owner.id)).rejects.toMatchObject({
      status: 404,
      code: "CHALLENGE_NOT_FOUND",
    });
  });

  it("throws 404 when the requester is not the owner and leaves the row", async () => {
    const owner = await createUser({ handle: "alice" });
    const stranger = await createUser({ handle: "bob" });
    const challenge = await seedChallenge(owner.id, { title: "Mine" });
    await expect(deleteChallenge(challenge.id, stranger.id)).rejects.toMatchObject({
      status: 404,
      code: "CHALLENGE_NOT_FOUND",
    });

    const found = await prisma.challenge.findUnique({ where: { id: challenge.id } });
    expect(found).not.toBeNull();
  });
});

describe("getMilestones", () => {
  it("returns an empty array when no milestones earned", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id);
    const milestones = await getMilestones(challenge.id);
    expect(milestones).toEqual([]);
  });

  it("returns earned milestones ordered by earnedAt", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await seedChallenge(owner.id);

    await prisma.milestone.create({
      data: { challengeId: challenge.id, kind: "COMPLETED_7" },
    });
    await prisma.milestone.create({
      data: { challengeId: challenge.id, kind: "STREAK_7" },
    });

    const milestones = await getMilestones(challenge.id);
    expect(milestones).toHaveLength(2);
    expect(milestones.map((m) => m.kind)).toContain("COMPLETED_7");
    expect(milestones.map((m) => m.kind)).toContain("STREAK_7");
  });
});
