import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn(() => new Promise(() => {})) }));
vi.mock("next-auth/react", () => ({ signIn: mockSignIn }));

import MagicPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MagicPage", () => {
  it("passes a string token from searchParams to the client component", async () => {
    const ui = await MagicPage({ searchParams: Promise.resolve({ token: "tok-1" }) });
    render(ui);
    expect(screen.getByTestId("magic-verifying")).toBeInTheDocument();
    expect(mockSignIn).toHaveBeenCalledWith("magic-link", {
      token: "tok-1",
      redirect: false,
    });
  });

  it("uses the first value when token is an array", async () => {
    const ui = await MagicPage({
      searchParams: Promise.resolve({ token: ["tok-a", "tok-b"] }),
    });
    render(ui);
    expect(mockSignIn).toHaveBeenCalledWith(
      "magic-link",
      expect.objectContaining({ token: "tok-a" }),
    );
  });

  it("renders the error state when no token is present", async () => {
    const ui = await MagicPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByTestId("magic-error")).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
