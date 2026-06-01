// @vitest-environment node
import { describe, beforeEach, it, expect, afterAll, vi } from "vitest";

// ---- mocks ----
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Mock storage so we don't hit real S3
vi.mock("@/lib/storage", () => ({
  presignGet: vi.fn().mockResolvedValue("https://signed-get/recap.mp4"),
  presignPut: vi.fn().mockResolvedValue("https://signed-put"),
  putObject: vi.fn().mockResolvedValue(undefined),
  newMediaKey: vi.fn(),
  ensureBucket: vi.fn(),
}));

// Use the fake renderer (no Chromium)
process.env.RECAP_FAKE = "1";

// ---- imports ----
import { prisma, resetDb, createUser, createChallenge } from "../../test/db";
import { buildRecapData, generateRecap, listRecaps } from "./recap";

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── buildRecapData (pure mapper) ──────────────────────────────────────────

describe("buildRecapData — DAY kind", () => {
  const challenge = {
    id: "c1",
    title: "Work out",
    lengthDays: 50,
    unit: "min",
    goalType: "TARGET" as const,
    dailyTarget: 60,
  };

  it("includes only the latest day in days array", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: true, totalAmount: 60 },
      { dayKey: "2026-06-02", completed: true, totalAmount: 45 },
      { dayKey: "2026-06-03", completed: false, totalAmount: 30 },
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "DAY");
    expect(result.kind).toBe("DAY");
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.dayKey).toBe("2026-06-03");
  });

  it("returns empty days when no dayStatuses", () => {
    const result = buildRecapData(challenge, [], [], "DAY");
    expect(result.days).toHaveLength(0);
  });

  it("stats reflect all dayStatuses (not just window)", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: true, totalAmount: 60 },
      { dayKey: "2026-06-02", completed: true, totalAmount: 60 },
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "DAY");
    expect(result.stats.daysCompleted).toBe(2);
    expect(result.stats.totalAmount).toBe(120);
    expect(result.stats.unit).toBe("min");
  });

  it("attaches photoUrl from activities with media", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: true, totalAmount: 60 },
    ];
    const activitiesWithMedia = [
      { dayKey: "2026-06-01", media: [{ objectKey: "media/u1/img.jpg", url: "https://photo-url" }] },
    ];
    const result = buildRecapData(challenge, dayStatuses, activitiesWithMedia, "DAY");
    expect(result.days[0]!.photoUrl).toBe("https://photo-url");
  });

  it("days without photos have no photoUrl", () => {
    const dayStatuses = [{ dayKey: "2026-06-01", completed: true, totalAmount: 60 }];
    const result = buildRecapData(challenge, dayStatuses, [], "DAY");
    expect(result.days[0]!.photoUrl).toBeUndefined();
  });

  it("sets title, lengthDays, dayNumber from challenge", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: true, totalAmount: 60 },
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "DAY");
    expect(result.title).toBe("Work out");
    expect(result.lengthDays).toBe(50);
    expect(result.dayNumber).toBe(1); // 1 completed day
  });
});

describe("buildRecapData — WEEK kind", () => {
  const challenge = {
    id: "c1",
    title: "Test",
    lengthDays: 50,
    unit: undefined,
    goalType: "BINARY" as const,
    dailyTarget: null,
  };

  it("includes up to last 7 days in chronological order", () => {
    const dayStatuses = [
      { dayKey: "2026-05-26", completed: true, totalAmount: 1 },
      { dayKey: "2026-05-27", completed: true, totalAmount: 1 },
      { dayKey: "2026-05-28", completed: false, totalAmount: 0 },
      { dayKey: "2026-05-29", completed: true, totalAmount: 1 },
      { dayKey: "2026-05-30", completed: true, totalAmount: 1 },
      { dayKey: "2026-05-31", completed: false, totalAmount: 0 },
      { dayKey: "2026-06-01", completed: true, totalAmount: 1 },
      { dayKey: "2026-06-02", completed: true, totalAmount: 1 }, // 8th day
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "WEEK");
    expect(result.kind).toBe("WEEK");
    expect(result.days).toHaveLength(7);
    // Should be the last 7 in sorted order (newest 7)
    expect(result.days[0]!.dayKey).toBe("2026-05-27");
    expect(result.days[6]!.dayKey).toBe("2026-06-02");
  });

  it("returns all days when fewer than 7", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: true, totalAmount: 1 },
      { dayKey: "2026-06-02", completed: false, totalAmount: 0 },
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "WEEK");
    expect(result.days).toHaveLength(2);
  });

  it("unit is undefined when challenge has no unit", () => {
    const dayStatuses = [{ dayKey: "2026-06-01", completed: true, totalAmount: 1 }];
    const result = buildRecapData(challenge, dayStatuses, [], "WEEK");
    expect(result.stats.unit).toBeUndefined();
  });
});

describe("buildRecapData — FIFTY kind", () => {
  const challenge = {
    id: "c1",
    title: "50-day run",
    lengthDays: 50,
    unit: "km",
    goalType: "TARGET" as const,
    dailyTarget: 5,
  };

  it("includes all dayStatuses", () => {
    const dayStatuses = Array.from({ length: 10 }, (_, i) => ({
      dayKey: `2026-06-${String(i + 1).padStart(2, "0")}`,
      completed: true,
      totalAmount: 5,
    }));
    const result = buildRecapData(challenge, dayStatuses, [], "FIFTY");
    expect(result.kind).toBe("FIFTY");
    expect(result.days).toHaveLength(10);
  });

  it("totalAmount in stats sums all days", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: true, totalAmount: 5 },
      { dayKey: "2026-06-02", completed: true, totalAmount: 7 },
      { dayKey: "2026-06-03", completed: false, totalAmount: 0 },
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "FIFTY");
    expect(result.stats.totalAmount).toBe(12);
    expect(result.stats.daysCompleted).toBe(2);
  });

  it("currentStreak is 0 when no days completed", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: false, totalAmount: 0 },
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "FIFTY");
    expect(result.stats.currentStreak).toBe(0);
  });

  it("uses first photo per day from activitiesWithMedia", () => {
    const dayStatuses = [{ dayKey: "2026-06-01", completed: true, totalAmount: 5 }];
    const activitiesWithMedia = [
      { dayKey: "2026-06-01", media: [
        { objectKey: "media/u1/first.jpg", url: "https://first" },
        { objectKey: "media/u1/second.jpg", url: "https://second" },
      ]},
    ];
    const result = buildRecapData(challenge, dayStatuses, activitiesWithMedia, "FIFTY");
    expect(result.days[0]!.photoUrl).toBe("https://first");
  });

  it("days with zero totalAmount have no amount field", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: false, totalAmount: 0 },
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "FIFTY");
    expect(result.days[0]!.amount).toBeUndefined();
  });

  it("days with positive totalAmount include amount", () => {
    const dayStatuses = [
      { dayKey: "2026-06-01", completed: true, totalAmount: 7.5 },
    ];
    const result = buildRecapData(challenge, dayStatuses, [], "FIFTY");
    expect(result.days[0]!.amount).toBe(7.5);
  });
});

// ─── generateRecap integration tests ───────────────────────────────────────

describe("generateRecap", () => {
  it("creates a Recap row and returns recapId + kind + url", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id);

    const result = await generateRecap(owner.id, challenge.id, "DAY");

    expect(result.recapId).toBeTruthy();
    expect(result.kind).toBe("DAY");
    expect(result.url).toBe("https://signed-get/recap.mp4");

    const recapRow = await prisma.recap.findUnique({ where: { id: result.recapId } });
    expect(recapRow).not.toBeNull();
    expect(recapRow!.challengeId).toBe(challenge.id);
    expect(recapRow!.kind).toBe("DAY");
    expect(recapRow!.objectKey).toMatch(/^media\/.*\.mp4$/);
  });

  it("throws 404 when challenge does not exist", async () => {
    const owner = await createUser({ handle: "alice" });
    await expect(
      generateRecap(owner.id, "nonexistent-id", "DAY"),
    ).rejects.toMatchObject({ status: 404, code: "CHALLENGE_NOT_FOUND" });
  });

  it("throws 403 FORBIDDEN when user is not the owner", async () => {
    const owner = await createUser({ handle: "alice" });
    const other = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id);

    await expect(
      generateRecap(other.id, challenge.id, "DAY"),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("generates WEEK recap row", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id);

    const result = await generateRecap(owner.id, challenge.id, "WEEK");
    expect(result.kind).toBe("WEEK");
    const row = await prisma.recap.findUnique({ where: { id: result.recapId } });
    expect(row!.kind).toBe("WEEK");
  });

  it("generates FIFTY recap row", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id);

    const result = await generateRecap(owner.id, challenge.id, "FIFTY");
    expect(result.kind).toBe("FIFTY");
    const row = await prisma.recap.findUnique({ where: { id: result.recapId } });
    expect(row!.kind).toBe("FIFTY");
  });
});

// ─── listRecaps integration tests ──────────────────────────────────────────

describe("listRecaps", () => {
  it("returns empty array when no recaps exist", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id);

    const result = await listRecaps(challenge.id, owner.id);
    expect(result).toEqual([]);
  });

  it("returns recaps with signed urls, newest first", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id);

    // Create recaps directly in DB so we control order
    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "DAY", objectKey: "media/a/day.mp4" },
    });
    // Small delay to ensure different createdAt
    await new Promise((r) => setTimeout(r, 5));
    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "WEEK", objectKey: "media/a/week.mp4" },
    });

    const result = await listRecaps(challenge.id, owner.id);
    expect(result).toHaveLength(2);
    // Newest first
    expect(result[0]!.kind).toBe("WEEK");
    expect(result[1]!.kind).toBe("DAY");
    expect(result[0]!.url).toBe("https://signed-get/recap.mp4");
    expect(result[0]!.id).toBeTruthy();
    expect(result[0]!.createdAt).toBeInstanceOf(Date);
  });

  it("throws 404 when challenge does not exist", async () => {
    const viewer = await createUser({ handle: "alice" });
    await expect(
      listRecaps("nonexistent-id", viewer.id),
    ).rejects.toMatchObject({ status: 404, code: "CHALLENGE_NOT_FOUND" });
  });

  it("throws 404 for non-owner on PRIVATE challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const viewer = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, { visibility: "PRIVATE" });

    await expect(
      listRecaps(challenge.id, viewer.id),
    ).rejects.toMatchObject({ status: 404, code: "CHALLENGE_NOT_FOUND" });
  });

  it("returns recaps for owner of PRIVATE challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const challenge = await createChallenge(owner.id, { visibility: "PRIVATE" });
    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "DAY", objectKey: "media/a/day.mp4" },
    });

    const result = await listRecaps(challenge.id, owner.id);
    expect(result).toHaveLength(1);
  });

  it("throws 404 for non-follower on FOLLOWERS challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const viewer = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, { visibility: "FOLLOWERS" });

    await expect(
      listRecaps(challenge.id, viewer.id),
    ).rejects.toMatchObject({ status: 404, code: "CHALLENGE_NOT_FOUND" });
  });

  it("returns recaps for a follower on FOLLOWERS challenge", async () => {
    const owner = await createUser({ handle: "alice" });
    const viewer = await createUser({ handle: "bob" });
    const challenge = await createChallenge(owner.id, { visibility: "FOLLOWERS" });

    // Create follow edge
    await prisma.follow.create({
      data: { followerId: viewer.id, followeeId: owner.id },
    });

    await prisma.recap.create({
      data: { challengeId: challenge.id, kind: "WEEK", objectKey: "media/a/week.mp4" },
    });

    const result = await listRecaps(challenge.id, viewer.id);
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("WEEK");
  });
});
