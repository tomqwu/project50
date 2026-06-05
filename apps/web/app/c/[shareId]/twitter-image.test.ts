import { describe, expect, it, vi } from "vitest";

vi.mock("next/og", () => ({
  ImageResponse: vi.fn().mockImplementation((el: unknown, opts: unknown) => ({ el, opts })),
}));

vi.mock("@/lib/api/challenges", () => ({
  getChallengeByShareId: vi.fn(),
}));

vi.mock("@project50/core", () => ({ dayNumber: vi.fn(), localDayKey: vi.fn() }));

import TwitterImage, { alt, contentType, revalidate, size } from "./twitter-image";
import OpengraphImage from "./opengraph-image";

describe("per-recap twitter-image route", () => {
  it("re-exports the recap opengraph-image renderer and metadata", () => {
    expect(TwitterImage).toBe(OpengraphImage);
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toContain("project50");
    expect(revalidate).toBe(300);
  });
});
