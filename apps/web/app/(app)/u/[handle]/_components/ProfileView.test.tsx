import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ProfileView, type ProfileChallenge } from "./ProfileView";

afterEach(() => {
  cleanup();
});

const challenges: ProfileChallenge[] = [
  { id: "c1", title: "Run 5K", goalType: "TARGET" },
  { id: "c2", title: "Daily meditation", goalType: "BINARY" },
];

const baseProps = {
  handle: "alice",
  displayName: "Alice A",
  challenges,
  userId: "u-alice",
  isFollowing: false,
  isOwnProfile: false,
  hasViewer: true,
};

describe("ProfileView", () => {
  it("renders the display name and handle", () => {
    render(<ProfileView {...baseProps} />);

    expect(screen.getByTestId("profile-name")).toHaveTextContent("Alice A");
    expect(screen.getByTestId("profile-handle")).toHaveTextContent("@alice");
  });

  it("renders each public challenge with its title and goalType", () => {
    render(<ProfileView {...baseProps} />);

    const items = screen.getAllByTestId("profile-challenge");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Run 5K")).toBeInTheDocument();
    expect(screen.getByText("Daily meditation")).toBeInTheDocument();
    expect(screen.getByText("TARGET")).toBeInTheDocument();
    expect(screen.getByText("BINARY")).toBeInTheDocument();
  });

  it("renders an empty state when there are no challenges", () => {
    render(<ProfileView {...baseProps} handle="bob" displayName="Bob B" challenges={[]} />);

    expect(screen.getByTestId("profile-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-challenge")).not.toBeInTheDocument();
  });

  it("shows a Follow button when a viewer is on someone else's profile", () => {
    render(<ProfileView {...baseProps} hasViewer isOwnProfile={false} />);

    expect(screen.getByTestId("follow-button-slot")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Follow");
  });

  it("shows an Unfollow button when the viewer already follows", () => {
    render(<ProfileView {...baseProps} isFollowing hasViewer isOwnProfile={false} />);

    expect(screen.getByRole("button")).toHaveTextContent("Unfollow");
  });

  it("hides the follow button on the viewer's own profile", () => {
    render(<ProfileView {...baseProps} isOwnProfile hasViewer />);

    expect(screen.queryByTestId("follow-button-slot")).not.toBeInTheDocument();
  });

  it("hides the follow button when there is no viewer", () => {
    render(<ProfileView {...baseProps} hasViewer={false} isOwnProfile={false} />);

    expect(screen.queryByTestId("follow-button-slot")).not.toBeInTheDocument();
  });
});
