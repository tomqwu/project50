import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReleaseBadge } from "./ReleaseBadge";

const RELEASE_KEYS = [
  "NEXT_PUBLIC_RELEASE_TAG",
  "NEXT_PUBLIC_RELEASE_SHA",
  "NEXT_PUBLIC_RELEASE_TIME",
  "NEXT_PUBLIC_RELEASE_TITLE",
  "NEXT_PUBLIC_RELEASE_URL",
];

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  for (const k of RELEASE_KEYS) delete process.env[k];
});

describe("ReleaseBadge", () => {
  it("shows dev fallbacks (no tag link, no timestamp) when nothing is injected", () => {
    render(<ReleaseBadge />);
    const badge = screen.getByTestId("release-badge");
    expect(badge).toHaveTextContent("dev");
    // 'local' sha is hidden
    expect(badge).not.toHaveTextContent("local");
    expect(screen.queryByTestId("release-badge-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("release-badge-time")).not.toBeInTheDocument();
    expect(screen.getByTestId("release-badge-title")).toHaveTextContent("Local development build");
  });

  it("renders tag · sha, timestamp, title, and a release-notes link when injected", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TAG", "v2026.06.04.1");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_SHA", "4c3f9ab");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TIME", "2026-06-04T09:40:00.000Z");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TITLE", "Day-complete next-step guidance");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_URL", "https://github.com/tomqwu/project50/releases/tag/v2026.06.04.1");

    render(<ReleaseBadge />);
    const badge = screen.getByTestId("release-badge");
    expect(badge).toHaveTextContent("v2026.06.04.1 · 4c3f9ab");
    expect(screen.getByTestId("release-badge-time")).toHaveTextContent("2026-06-04 09:40 UTC");
    expect(screen.getByTestId("release-badge-title")).toHaveTextContent("Day-complete next-step guidance");
    const link = screen.getByTestId("release-badge-link");
    expect(link).toHaveAttribute("href", "https://github.com/tomqwu/project50/releases/tag/v2026.06.04.1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the tag without a link when a tag is set but no release URL", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TAG", "v2026.06.04.2");
    vi.stubEnv("NEXT_PUBLIC_RELEASE_SHA", "deadbee");
    render(<ReleaseBadge />);
    expect(screen.getByTestId("release-badge")).toHaveTextContent("v2026.06.04.2 · deadbee");
    expect(screen.queryByTestId("release-badge-link")).not.toBeInTheDocument();
  });
});
