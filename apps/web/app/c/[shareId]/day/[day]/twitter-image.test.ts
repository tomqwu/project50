import { describe, expect, it, vi } from "vitest";

vi.mock("next/og", () => ({
  ImageResponse: vi.fn().mockImplementation((el: unknown, opts: unknown) => ({ el, opts })),
}));

vi.mock("@/lib/api/day-share", () => ({
  getPublicDay: vi.fn(),
}));

import TwitterImage, { alt, contentType, revalidate, size } from "./twitter-image";
import OpengraphImage from "./opengraph-image";

describe("per-day twitter-image route", () => {
  it("re-exports the per-day opengraph-image renderer and metadata", () => {
    expect(TwitterImage).toBe(OpengraphImage);
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toContain("project50");
  });

  it("declares its own literal revalidate = 300 (re-export is ignored by Next)", () => {
    expect(revalidate).toBe(300);
  });
});
