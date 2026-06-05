import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/og", () => ({
  ImageResponse: vi.fn().mockImplementation((el: unknown, opts: unknown) => ({ el, opts })),
}));

const { mockGetPublicDay } = vi.hoisted(() => ({
  mockGetPublicDay: vi.fn(),
}));
vi.mock("@/lib/api/day-share", () => ({
  getPublicDay: mockGetPublicDay,
}));

import ShareDayOpengraphImage, {
  alt,
  contentType,
  revalidate,
  size,
} from "./opengraph-image";
import { ImageResponse } from "next/og";

afterEach(() => {
  vi.resetAllMocks();
});

beforeEach(() => {
  vi.mocked(ImageResponse).mockImplementation(
    (el: unknown, opts: unknown) => ({ el, opts }) as never,
  );
});

const params = (shareId: string, day: string) => Promise.resolve({ shareId, day });

const publicDay = {
  challenge: { title: "Project 50", lengthDays: 50 },
  dayNumber: 7,
  dayKey: "2026-06-07",
  rulesCompleted: 7,
  ruleChecks: [true, true, true, true, true, true, true],
  media: [],
};

describe("per-day opengraph-image route", () => {
  it("exports 1200x630 size, png type, and alt", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toContain("project50");
  });

  it("declares a literal revalidate = 300 (route config is not re-export-safe)", () => {
    expect(revalidate).toBe(300);
  });

  it("renders a Day N / 50 card for a public day", async () => {
    mockGetPublicDay.mockResolvedValue(publicDay);

    const res = await ShareDayOpengraphImage({ params: params("abc", "7") });
    expect(res).toBeTruthy();
    expect(ImageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 1200, height: 630 }),
    );
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("Day 7 of 50");
    expect(el).toContain("Project 50");
    expect(el).toContain("7 / 7 rules");
  });

  it("parses the day param to a number for the loader", async () => {
    mockGetPublicDay.mockResolvedValue(publicDay);
    await ShareDayOpengraphImage({ params: params("abc", "7") });
    expect(mockGetPublicDay).toHaveBeenCalledWith("abc", 7);
  });

  it("sets a short revalidating Cache-Control (not next/og's immutable year)", async () => {
    mockGetPublicDay.mockResolvedValue(publicDay);
    await ShareDayOpengraphImage({ params: params("abc", "7") });
    const opts = vi.mocked(ImageResponse).mock.calls[0]![1] as {
      headers?: Record<string, string>;
    };
    const cacheControl = opts.headers?.["Cache-Control"];
    expect(cacheControl).toBe("public, max-age=300, s-maxage=300");
    expect(cacheControl).not.toContain("immutable");
  });

  it("shows a partial rules count for an incomplete day", async () => {
    mockGetPublicDay.mockResolvedValue({ ...publicDay, rulesCompleted: 3 });
    await ShareDayOpengraphImage({ params: params("abc", "7") });
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("3 / 7 rules");
  });

  it("falls back to the default branded card when the day is missing/private", async () => {
    mockGetPublicDay.mockResolvedValue(null);
    await ShareDayOpengraphImage({ params: params("missing", "7") });
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("7 rules · 50 days · no days off");
  });

  it("falls back to the default branded card for a non-numeric day param", async () => {
    await ShareDayOpengraphImage({ params: params("abc", "not-a-day") });
    expect(mockGetPublicDay).not.toHaveBeenCalled();
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("7 rules · 50 days · no days off");
  });

  it("falls back to the default branded card when the loader throws", async () => {
    mockGetPublicDay.mockRejectedValue(new Error("db down"));
    await ShareDayOpengraphImage({ params: params("boom", "7") });
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("7 rules · 50 days · no days off");
  });
});
