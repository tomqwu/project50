import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Use vi.hoisted to define the mock before vi.mock hoisting
const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn: mockSignIn }));

import { SignInButtons } from "./SignInButtons";

describe("SignInButtons", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Google and Facebook buttons", () => {
    render(<SignInButtons />);
    expect(screen.getByTestId("signin-google")).toBeInTheDocument();
    expect(screen.getByTestId("signin-facebook")).toBeInTheDocument();
  });

  it("does NOT render e2e button when e2eEnabled is false (default)", () => {
    render(<SignInButtons />);
    expect(screen.queryByTestId("signin-e2e")).toBeNull();
  });

  it("renders e2e button when e2eEnabled is true", () => {
    render(<SignInButtons e2eEnabled />);
    expect(screen.getByTestId("signin-e2e")).toBeInTheDocument();
  });

  it("calls signIn('google') on Google button click", () => {
    render(<SignInButtons />);
    fireEvent.click(screen.getByTestId("signin-google"));
    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });

  it("calls signIn('facebook') on Facebook button click", () => {
    render(<SignInButtons />);
    fireEvent.click(screen.getByTestId("signin-facebook"));
    expect(mockSignIn).toHaveBeenCalledWith("facebook", { callbackUrl: "/" });
  });

  it("calls signIn('e2e') on E2E button click with the fixed 'demo' handle", () => {
    render(<SignInButtons e2eEnabled />);
    fireEvent.click(screen.getByTestId("signin-e2e"));
    expect(mockSignIn).toHaveBeenCalledWith("e2e", { callbackUrl: "/", handle: "demo" });
  });

  it("renders the dev button with the 'Continue as demo account' label", () => {
    render(<SignInButtons e2eEnabled />);
    expect(screen.getByTestId("signin-e2e")).toHaveTextContent("Continue as demo account");
  });
});
