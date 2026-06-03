import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const { mockSignOutAction } = vi.hoisted(() => ({ mockSignOutAction: vi.fn() }));
vi.mock("../_actions/auth", () => ({ signOutAction: mockSignOutAction }));

import { SignOutButton } from "./SignOutButton";

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a Sign out button", () => {
    render(<SignOutButton />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("calls signOutAction when clicked", () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mockSignOutAction).toHaveBeenCalledTimes(1);
  });
});
