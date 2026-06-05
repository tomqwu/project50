import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetChallengeByShareId } = vi.hoisted(() => ({
  mockGetChallengeByShareId: vi.fn(),
}));
vi.mock("@/lib/api/challenges", () => ({
  getChallengeByShareId: mockGetChallengeByShareId,
}));

const { mockListDayMedia } = vi.hoisted(() => ({
  mockListDayMedia: vi.fn(),
}));
vi.mock("@/lib/project50", () => ({
  listProject50DayMedia: mockListDayMedia,
}));

const { mockRuleCheckFindMany, mockJournalFindUnique } = vi.hoisted(() => ({
  mockRuleCheckFindMany: vi.fn(),
  mockJournalFindUnique: vi.fn(),
}));
vi.mock("@project50/db", () => ({
  prisma: {
    ruleCheck: { findMany: mockRuleCheckFindMany },
    dayJournal: { findUnique: mockJournalFindUnique },
  },
}));

import { getPublicDay } from "./day-share";

const baseChallenge = {
  id: "run-1",
  title: "Project 50",
  startDate: "2026-06-01",
  lengthDays: 50,
  timezone: "UTC",
  visibility: "PUBLIC",
  shareId: "share-abc",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetChallengeByShareId.mockResolvedValue(baseChallenge);
  mockListDayMedia.mockResolvedValue([]);
  mockRuleCheckFindMany.mockResolvedValue([]);
  mockJournalFindUnique.mockResolvedValue(null);
});

describe("getPublicDay", () => {
  it("returns null when the challenge is not found / not PUBLIC", async () => {
    mockGetChallengeByShareId.mockResolvedValue(null);
    expect(await getPublicDay("nope", 1)).toBeNull();
    expect(mockRuleCheckFindMany).not.toHaveBeenCalled();
  });

  it("returns null when dayNumber is below 1", async () => {
    expect(await getPublicDay("share-abc", 0)).toBeNull();
    expect(await getPublicDay("share-abc", -5)).toBeNull();
    expect(mockRuleCheckFindMany).not.toHaveBeenCalled();
  });

  it("returns null when dayNumber exceeds lengthDays", async () => {
    expect(await getPublicDay("share-abc", 51)).toBeNull();
    expect(mockRuleCheckFindMany).not.toHaveBeenCalled();
  });

  it("returns null for a non-integer dayNumber", async () => {
    expect(await getPublicDay("share-abc", 2.5)).toBeNull();
    expect(await getPublicDay("share-abc", Number.NaN)).toBeNull();
    expect(mockRuleCheckFindMany).not.toHaveBeenCalled();
  });

  it("derives the dayKey via addDays(startDate, n-1) and queries that day", async () => {
    const result = await getPublicDay("share-abc", 3);
    expect(result).not.toBeNull();
    // 2026-06-01 + (3-1) days = 2026-06-03
    expect(result!.dayKey).toBe("2026-06-03");
    expect(result!.dayNumber).toBe(3);
    expect(mockRuleCheckFindMany).toHaveBeenCalledWith({
      where: { challengeId: "run-1", dayKey: "2026-06-03", done: true },
    });
    expect(mockListDayMedia).toHaveBeenCalledWith("run-1", "2026-06-03");
    expect(mockJournalFindUnique).toHaveBeenCalledWith({
      where: { challengeId_dayKey: { challengeId: "run-1", dayKey: "2026-06-03" } },
      select: { wins: true, lessons: true },
    });
  });

  it("maps rule checks into a boolean[7] indexed by ruleId and counts completed", async () => {
    mockRuleCheckFindMany.mockResolvedValue([
      { ruleId: 1 },
      { ruleId: 3 },
      { ruleId: 7 },
    ]);
    const result = await getPublicDay("share-abc", 1);
    expect(result!.ruleChecks).toEqual([true, false, true, false, false, false, true]);
    expect(result!.rulesCompleted).toBe(3);
  });

  it("reports 7/7 when all rules are checked", async () => {
    mockRuleCheckFindMany.mockResolvedValue(
      [1, 2, 3, 4, 5, 6, 7].map((ruleId) => ({ ruleId })),
    );
    const result = await getPublicDay("share-abc", 50);
    expect(result!.ruleChecks).toEqual([true, true, true, true, true, true, true]);
    expect(result!.rulesCompleted).toBe(7);
  });

  it("includes signed media URLs from listProject50DayMedia", async () => {
    mockListDayMedia.mockResolvedValue([
      { objectKey: "k1", width: 100, height: 100, url: "https://signed/1" },
      { objectKey: "k2", width: 200, height: 200, url: "https://signed/2" },
    ]);
    const result = await getPublicDay("share-abc", 2);
    expect(result!.media).toEqual([
      { url: "https://signed/1" },
      { url: "https://signed/2" },
    ]);
  });

  it("includes the journal when present", async () => {
    mockJournalFindUnique.mockResolvedValue({ wins: "ran 5k", lessons: "hydrate earlier" });
    const result = await getPublicDay("share-abc", 4);
    expect(result!.journal).toEqual({ wins: "ran 5k", lessons: "hydrate earlier" });
  });

  it("omits the journal when there is no entry for the day", async () => {
    mockJournalFindUnique.mockResolvedValue(null);
    const result = await getPublicDay("share-abc", 4);
    expect(result!.journal).toBeUndefined();
  });

  it("returns the loaded challenge on the result", async () => {
    const result = await getPublicDay("share-abc", 1);
    expect(result!.challenge).toBe(baseChallenge);
  });
});
