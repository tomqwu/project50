import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mockUseCurrentFrame = vi.fn(() => 0);

vi.mock("remotion", () => ({
  useCurrentFrame: () => mockUseCurrentFrame(),
  interpolate: (
    input: number,
    inputRange: readonly number[],
    outputRange: readonly number[],
    options?: { extrapolateLeft?: string; extrapolateRight?: string },
  ) => {
    const [inMin, inMax] = [inputRange[0]!, inputRange[inputRange.length - 1]!];
    const [outMin, outMax] = [outputRange[0]!, outputRange[outputRange.length - 1]!];
    const leftExtrap = options?.extrapolateLeft ?? "extend";
    const rightExtrap = options?.extrapolateRight ?? "extend";
    if (input <= inMin!) return leftExtrap === "clamp" ? outMin! : outMin!;
    if (input >= inMax!) return rightExtrap === "clamp" ? outMax! : outMax!;
    const t = (input - inMin!) / (inMax! - inMin!);
    return outMin! + t * (outMax! - outMin!);
  },
  AbsoluteFill: ({ children, style, ...props }: React.PropsWithChildren<{ style?: React.CSSProperties; [key: string]: unknown }>) =>
    React.createElement("div", { style, ...props }, children),
}));

import { PhotoStrip } from "./PhotoStrip.js";

describe("PhotoStrip", () => {
  beforeEach(() => {
    mockUseCurrentFrame.mockReturnValue(0);
  });

  // ── No-photos branch ──────────────────────────────────────────────────────

  it("renders placeholder when photoUrls is undefined", () => {
    render(<PhotoStrip />);
    expect(screen.getByTestId("photo-strip-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("photo-strip-images")).toBeNull();
  });

  it("renders placeholder when photoUrls is empty array", () => {
    render(<PhotoStrip photoUrls={[]} />);
    expect(screen.getByTestId("photo-strip-placeholder")).toBeInTheDocument();
  });

  it("placeholder contains 'No photos' text", () => {
    render(<PhotoStrip photoUrls={[]} />);
    expect(screen.getByTestId("photo-strip-placeholder").textContent).toContain("No photos");
  });

  // ── With photos ──────────────────────────────────────────────────────────

  it("renders images container when photoUrls provided", () => {
    render(<PhotoStrip photoUrls={["http://a.test/1.jpg"]} />);
    expect(screen.getByTestId("photo-strip-images")).toBeInTheDocument();
    expect(screen.queryByTestId("photo-strip-placeholder")).toBeNull();
  });

  it("renders one img element per photo URL", () => {
    render(
      <PhotoStrip photoUrls={["http://a.test/1.jpg", "http://a.test/2.jpg"]} />,
    );
    expect(screen.getByTestId("photo-strip-img-0")).toBeInTheDocument();
    expect(screen.getByTestId("photo-strip-img-1")).toBeInTheDocument();
  });

  it("first image is fully opaque at frame 0 (before it would fade out)", () => {
    mockUseCurrentFrame.mockReturnValue(0);
    render(
      <PhotoStrip
        photoUrls={["http://a.test/1.jpg", "http://a.test/2.jpg"]}
        framesPerPhoto={60}
        fadeDuration={15}
      />,
    );
    const img0 = screen.getByTestId("photo-strip-img-0");
    const opacity = (img0 as HTMLImageElement).style.opacity;
    expect(Number(opacity)).toBe(1);
  });

  it("second image has 0 opacity at frame 0 (not yet in view)", () => {
    mockUseCurrentFrame.mockReturnValue(0);
    render(
      <PhotoStrip
        photoUrls={["http://a.test/1.jpg", "http://a.test/2.jpg"]}
        framesPerPhoto={60}
        fadeDuration={15}
      />,
    );
    const img1 = screen.getByTestId("photo-strip-img-1");
    const opacity = (img1 as HTMLImageElement).style.opacity;
    expect(Number(opacity)).toBe(0);
  });

  it("second image fades in during its start window", () => {
    // Second photo starts at frame 60, fadeDuration=15 → halfway at frame 67
    mockUseCurrentFrame.mockReturnValue(67);
    render(
      <PhotoStrip
        photoUrls={["http://a.test/1.jpg", "http://a.test/2.jpg"]}
        framesPerPhoto={60}
        fadeDuration={15}
      />,
    );
    const img1 = screen.getByTestId("photo-strip-img-1");
    const opacity = Number((img1 as HTMLImageElement).style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it("first image fades out toward the end of its window", () => {
    // First photo ends at frame 60, fadeOut from 45→60; at frame 52 ~ 50% fade out
    mockUseCurrentFrame.mockReturnValue(52);
    render(
      <PhotoStrip
        photoUrls={["http://a.test/1.jpg", "http://a.test/2.jpg"]}
        framesPerPhoto={60}
        fadeDuration={15}
      />,
    );
    const img0 = screen.getByTestId("photo-strip-img-0");
    const opacity = Number((img0 as HTMLImageElement).style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it("single photo stays at opacity 1 throughout (no second photo to cross-fade with)", () => {
    mockUseCurrentFrame.mockReturnValue(30);
    render(
      <PhotoStrip
        photoUrls={["http://a.test/only.jpg"]}
        framesPerPhoto={60}
        fadeDuration={15}
      />,
    );
    const img = screen.getByTestId("photo-strip-img-0");
    // Hold phase (no fade-out unless there's a second photo driving the crossfade)
    const opacity = Number((img as HTMLImageElement).style.opacity);
    expect(opacity).toBe(1);
  });

  it("non-first image is fully opaque during its hold phase (line 92 branch)", () => {
    // Second photo: start=60, end=120, fadeIn=[60,75], fadeOut=[105,120]
    // At frame 90, it is in the hold phase (>fadeIn[1] and <fadeOut[0])
    mockUseCurrentFrame.mockReturnValue(90);
    render(
      <PhotoStrip
        photoUrls={["http://a.test/1.jpg", "http://a.test/2.jpg"]}
        framesPerPhoto={60}
        fadeDuration={15}
      />,
    );
    const img1 = screen.getByTestId("photo-strip-img-1");
    const opacity = Number((img1 as HTMLImageElement).style.opacity);
    expect(opacity).toBe(1);
  });
});
