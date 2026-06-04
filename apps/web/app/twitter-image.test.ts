import { describe, expect, it, vi } from "vitest";

vi.mock("next/og", () => ({
  ImageResponse: vi.fn().mockImplementation((el: unknown, opts: unknown) => ({ el, opts })),
}));

import TwitterImage, { alt, contentType, size } from "./twitter-image";
import OpengraphImage from "./opengraph-image";

describe("twitter-image route", () => {
  it("re-exports the default opengraph-image renderer and metadata", () => {
    expect(TwitterImage).toBe(OpengraphImage);
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toContain("project50");
  });
});
