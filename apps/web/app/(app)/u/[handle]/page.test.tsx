import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { PublicProfile } from "@/lib/api/profile";

const { mockGetPublicProfile, mockNotFound } = vi.hoisted(() => ({
  mockGetPublicProfile: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/api/profile", () => ({
  getPublicProfile: mockGetPublicProfile,
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

import PublicProfilePage from "./page";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const profile: PublicProfile = {
  handle: "alice",
  displayName: "Alice A",
  challenges: [{ id: "c1", title: "Run 5K", goalType: "TARGET" }],
};

describe("PublicProfilePage", () => {
  it("calls notFound for an unknown handle", async () => {
    mockGetPublicProfile.mockResolvedValue(null);

    await expect(
      PublicProfilePage({ params: Promise.resolve({ handle: "nobody" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalled();
    expect(mockGetPublicProfile).toHaveBeenCalledWith("nobody");
  });

  it("renders the ProfileView for a known handle", async () => {
    mockGetPublicProfile.mockResolvedValue(profile);

    const ui = await PublicProfilePage({
      params: Promise.resolve({ handle: "alice" }),
    });
    render(ui);

    expect(screen.getByTestId("profile-name")).toHaveTextContent("Alice A");
    expect(screen.getByTestId("profile-handle")).toHaveTextContent("@alice");
    expect(screen.getByText("Run 5K")).toBeInTheDocument();
  });
});
