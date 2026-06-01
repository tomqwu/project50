import { describe, expect, it, vi, afterEach } from "vitest";

// Mock next/og
vi.mock("next/og", () => ({
  ImageResponse: vi.fn().mockImplementation((el: unknown, opts: unknown) => ({ el, opts })),
}));

// Mock @project50/db
const { mockPrismaFindUnique } = vi.hoisted(() => ({
  mockPrismaFindUnique: vi.fn(),
}));

vi.mock("@project50/db", () => ({
  prisma: {
    challenge: {
      findUnique: mockPrismaFindUnique,
    },
  },
}));

// Mock @project50/core
const { mockDayNumber } = vi.hoisted(() => ({
  mockDayNumber: vi.fn(),
}));

vi.mock("@project50/core", () => ({
  dayNumber: mockDayNumber,
}));

// Mock @/auth (needed transitively)
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET } from "./route.tsx";
import { ImageResponse } from "next/og";

afterEach(() => {
  vi.resetAllMocks();
});

const params = (id: string) => Promise.resolve({ id });

const publicChallenge = {
  id: "c1",
  title: "Run 5K",
  goalType: "TARGET",
  unit: "km",
  dailyTarget: 5,
  startDate: "2026-06-01",
  lengthDays: 50,
  timezone: "UTC",
  visibility: "PUBLIC",
  dayStatuses: [
    { dayKey: "2026-06-01", totalAmount: 5, completed: true },
    { dayKey: "2026-06-02", totalAmount: 3, completed: false },
    { dayKey: "2026-06-03", totalAmount: 5, completed: true },
  ],
};

describe("GET /api/challenges/[id]/card", () => {
  it("returns 404 when challenge does not exist", async () => {
    mockPrismaFindUnique.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), { params: params("nonexistent") });
    expect(res.status).toBe(404);
  });

  it("returns 404 for PRIVATE challenge", async () => {
    mockPrismaFindUnique.mockResolvedValue({ ...publicChallenge, visibility: "PRIVATE" });

    const res = await GET(new Request("http://localhost"), { params: params("c1") });
    expect(res.status).toBe(404);
  });

  it("returns 404 for FOLLOWERS challenge", async () => {
    mockPrismaFindUnique.mockResolvedValue({ ...publicChallenge, visibility: "FOLLOWERS" });

    const res = await GET(new Request("http://localhost"), { params: params("c1") });
    expect(res.status).toBe(404);
  });

  it("calls ImageResponse with width 1200 and height 630 for PUBLIC challenge", async () => {
    mockPrismaFindUnique.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(25);

    await GET(new Request("http://localhost"), { params: params("c1") });

    expect(ImageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 1200, height: 630 }),
    );
  });

  it("uses buildCardModel output: headline and statText appear in JSX tree", async () => {
    mockPrismaFindUnique.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(25);

    await GET(new Request("http://localhost"), { params: params("c1") });

    const mockCalls = vi.mocked(ImageResponse).mock.calls;
    expect(mockCalls.length).toBeGreaterThan(0);
    // The first arg is the JSX element; serialize to string to check content
    const el = JSON.stringify(mockCalls[0]![0]);
    // headline "Day 25 of 50"
    expect(el).toContain("Day 25 of 50");
    // statText "2 days · 10 km" (completed days: 2, totalAmount: 5+5=10)
    expect(el).toContain("2 days");
    // subline is the title
    expect(el).toContain("Run 5K");
  });

  it("shows 'Day 50 complete' headline when dayNumber >= lengthDays", async () => {
    mockPrismaFindUnique.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(50);

    await GET(new Request("http://localhost"), { params: params("c1") });

    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("Day 50 complete");
  });

  it("handles BINARY challenge (no unit, no totalAmount in statText)", async () => {
    const binaryChallenge = {
      ...publicChallenge,
      goalType: "BINARY",
      unit: null,
      dailyTarget: null,
      dayStatuses: [
        { dayKey: "2026-06-01", totalAmount: 0, completed: true },
      ],
    };
    mockPrismaFindUnique.mockResolvedValue(binaryChallenge);
    mockDayNumber.mockReturnValue(1);

    await GET(new Request("http://localhost"), { params: params("c1") });

    expect(ImageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 1200, height: 630 }),
    );
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    // BINARY: no totalAmount, so just "1 days" (no unit suffix)
    expect(el).toContain("1 days");
  });

  it("clamps dayNumber to at least 1", async () => {
    mockPrismaFindUnique.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(-5); // negative day

    await GET(new Request("http://localhost"), { params: params("c1") });

    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    // dayNumber clamped to 1 → "Day 1 of 50"
    expect(el).toContain("Day 1 of 50");
  });

  it("includes wordmark in the element tree", async () => {
    mockPrismaFindUnique.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(10);

    await GET(new Request("http://localhost"), { params: params("c1") });

    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("project50");
  });

  it("handles null totalAmount on completed dayStatus (TARGET challenge)", async () => {
    const nullAmtChallenge = {
      ...publicChallenge,
      dayStatuses: [
        { dayKey: "2026-06-01", totalAmount: null, completed: true },
        { dayKey: "2026-06-02", totalAmount: 5, completed: true },
      ],
    };
    mockPrismaFindUnique.mockResolvedValue(nullAmtChallenge);
    mockDayNumber.mockReturnValue(10);

    await GET(new Request("http://localhost"), { params: params("c1") });

    expect(ImageResponse).toHaveBeenCalled();
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    // totalAmount = null→0 + 5 = 5, daysCompleted=2 → "2 days · 5 km"
    expect(el).toContain("2 days");
  });
});
