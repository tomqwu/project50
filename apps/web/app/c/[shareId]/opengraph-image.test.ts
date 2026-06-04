import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/og", () => ({
  ImageResponse: vi.fn().mockImplementation((el: unknown, opts: unknown) => ({ el, opts })),
}));

const { mockGetByShareId } = vi.hoisted(() => ({
  mockGetByShareId: vi.fn(),
}));
vi.mock("@/lib/api/challenges", () => ({
  getChallengeByShareId: mockGetByShareId,
}));

const { mockDayNumber } = vi.hoisted(() => ({ mockDayNumber: vi.fn() }));
vi.mock("@project50/core", () => ({ dayNumber: mockDayNumber }));

import ShareOpengraphImage, { alt, contentType, size } from "./opengraph-image";
import { ImageResponse } from "next/og";

afterEach(() => {
  vi.resetAllMocks();
});

const params = (shareId: string) => Promise.resolve({ shareId });

const publicChallenge = {
  id: "c1",
  title: "Run 5K",
  goalType: "TARGET",
  unit: "km",
  startDate: "2026-06-01",
  lengthDays: 50,
  visibility: "PUBLIC",
  dayStatuses: [
    { dayKey: "2026-06-01", totalAmount: 5, completed: true },
    { dayKey: "2026-06-02", totalAmount: 3, completed: false },
    { dayKey: "2026-06-03", totalAmount: 7, completed: true },
  ],
};

describe("per-recap opengraph-image route", () => {
  it("exports 1200x630 size, png type, and alt", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toContain("project50");
  });

  it("renders a personalized Day N / 50 card for a public share", async () => {
    mockGetByShareId.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(25);

    const res = await ShareOpengraphImage({ params: params("abc") });
    expect(res).toBeTruthy();
    expect(ImageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 1200, height: 630 }),
    );
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("Day 25 of 50");
    expect(el).toContain("Run 5K");
    // 2 completed days, totalAmount 5 + 7 = 12 km
    expect(el).toContain("2 days · 12 km");
  });

  it("sets a short revalidating Cache-Control (not next/og's year-long immutable)", async () => {
    mockGetByShareId.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(25);

    await ShareOpengraphImage({ params: params("abc") });
    const opts = vi.mocked(ImageResponse).mock.calls[0]![1] as {
      headers?: Record<string, string>;
    };
    const cacheControl = opts.headers?.["Cache-Control"];
    expect(cacheControl).toBe("public, max-age=300, s-maxage=300");
    expect(cacheControl).not.toContain("immutable");
  });

  it("clamps the day number to at least 1", async () => {
    mockGetByShareId.mockResolvedValue(publicChallenge);
    mockDayNumber.mockReturnValue(-3);

    await ShareOpengraphImage({ params: params("abc") });
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("Day 1 of 50");
  });

  it("omits the unit for a BINARY challenge", async () => {
    mockGetByShareId.mockResolvedValue({
      ...publicChallenge,
      goalType: "BINARY",
      unit: null,
    });
    mockDayNumber.mockReturnValue(10);

    await ShareOpengraphImage({ params: params("abc") });
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("2 days");
    expect(el).not.toContain(" km");
  });

  it("treats a null totalAmount on a completed day as zero", async () => {
    mockGetByShareId.mockResolvedValue({
      ...publicChallenge,
      dayStatuses: [
        { dayKey: "2026-06-01", totalAmount: null, completed: true },
        { dayKey: "2026-06-02", totalAmount: 4, completed: true },
      ],
    });
    mockDayNumber.mockReturnValue(10);

    await ShareOpengraphImage({ params: params("abc") });
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    // null -> 0, plus 4 = 4 km across 2 completed days
    expect(el).toContain("2 days · 4 km");
  });

  it("falls back to the default branded card when share is missing", async () => {
    mockGetByShareId.mockResolvedValue(null);

    await ShareOpengraphImage({ params: params("missing") });
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("7 rules · 50 days · no days off");
  });

  it("falls back to the default branded card when the loader throws", async () => {
    mockGetByShareId.mockRejectedValue(new Error("db down"));

    await ShareOpengraphImage({ params: params("boom") });
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("7 rules · 50 days · no days off");
  });
});
