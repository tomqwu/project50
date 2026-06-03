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

describe("ProfileView", () => {
  it("renders the display name and handle", () => {
    render(<ProfileView handle="alice" displayName="Alice A" challenges={challenges} />);

    expect(screen.getByTestId("profile-name")).toHaveTextContent("Alice A");
    expect(screen.getByTestId("profile-handle")).toHaveTextContent("@alice");
  });

  it("renders each public challenge with its title and goalType", () => {
    render(<ProfileView handle="alice" displayName="Alice A" challenges={challenges} />);

    const items = screen.getAllByTestId("profile-challenge");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Run 5K")).toBeInTheDocument();
    expect(screen.getByText("Daily meditation")).toBeInTheDocument();
    expect(screen.getByText("TARGET")).toBeInTheDocument();
    expect(screen.getByText("BINARY")).toBeInTheDocument();
  });

  it("renders an empty state when there are no challenges", () => {
    render(<ProfileView handle="bob" displayName="Bob B" challenges={[]} />);

    expect(screen.getByTestId("profile-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-challenge")).not.toBeInTheDocument();
  });
});
