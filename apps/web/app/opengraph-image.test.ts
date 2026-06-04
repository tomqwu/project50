import { describe, expect, it, vi } from "vitest";

vi.mock("next/og", () => ({
  ImageResponse: vi.fn().mockImplementation((el: unknown, opts: unknown) => ({ el, opts })),
}));

import OpengraphImage, { alt, contentType, size } from "./opengraph-image";
import { ImageResponse } from "next/og";

describe("default opengraph-image route", () => {
  it("exports 1200x630 size", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("exports image/png content type", () => {
    expect(contentType).toBe("image/png");
  });

  it("exports the branded alt tagline", () => {
    expect(alt).toContain("project50");
  });

  it("renders an ImageResponse at 1200x630 with the branded card", () => {
    const res = OpengraphImage();
    expect(res).toBeTruthy();
    expect(ImageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 1200, height: 630 }),
    );
    const el = JSON.stringify(vi.mocked(ImageResponse).mock.calls[0]![0]);
    expect(el).toContain("project50");
    expect(el).toContain("7 rules · 50 days · no days off");
  });
});
