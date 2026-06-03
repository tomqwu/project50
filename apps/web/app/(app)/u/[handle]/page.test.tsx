import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { PublicProfile } from "@/lib/api/profile";

const { mockGetPublicProfile, mockNotFound, mockRequireUser } = vi.hoisted(
  () => ({
    mockGetPublicProfile: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    mockRequireUser: vi.fn(),
  }),
);

vi.mock("@/lib/api/profile", () => ({
  getPublicProfile: mockGetPublicProfile,
}));

vi.mock("@/lib/session", () => ({
  requireUser: mockRequireUser,
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
  id: "u-alice",
  handle: "alice",
  displayName: "Alice A",
  challenges: [{ id: "c1", title: "Run 5K", goalType: "TARGET" }],
  isFollowing: false,
};

describe("PublicProfilePage", () => {
  it("calls notFound for an unknown handle", async () => {
    mockRequireUser.mockResolvedValue("u-bob");
    mockGetPublicProfile.mockResolvedValue(null);

    await expect(
      PublicProfilePage({ params: Promise.resolve({ handle: "nobody" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalled();
    expect(mockGetPublicProfile).toHaveBeenCalledWith("nobody", "u-bob");
  });

  it("renders the ProfileView with a Follow button for a signed-in viewer", async () => {
    mockRequireUser.mockResolvedValue("u-bob");
    mockGetPublicProfile.mockResolvedValue(profile);

    const ui = await PublicProfilePage({
      params: Promise.resolve({ handle: "alice" }),
    });
    render(ui);

    expect(mockGetPublicProfile).toHaveBeenCalledWith("alice", "u-bob");
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Alice A");
    expect(screen.getByTestId("profile-handle")).toHaveTextContent("@alice");
    expect(screen.getByText("Run 5K")).toBeInTheDocument();
    expect(screen.getByTestId("follow-button-slot")).toBeInTheDocument();
  });

  it("passes undefined viewer and hides the follow button when anonymous", async () => {
    mockRequireUser.mockRejectedValue(new Error("unauthenticated"));
    mockGetPublicProfile.mockResolvedValue(profile);

    const ui = await PublicProfilePage({
      params: Promise.resolve({ handle: "alice" }),
    });
    render(ui);

    expect(mockGetPublicProfile).toHaveBeenCalledWith("alice", undefined);
    expect(screen.queryByTestId("follow-button-slot")).not.toBeInTheDocument();
  });

  it("hides the follow button on the viewer's own profile", async () => {
    mockRequireUser.mockResolvedValue("u-alice");
    mockGetPublicProfile.mockResolvedValue(profile);

    const ui = await PublicProfilePage({
      params: Promise.resolve({ handle: "alice" }),
    });
    render(ui);

    expect(screen.queryByTestId("follow-button-slot")).not.toBeInTheDocument();
  });
});
