import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn: mockSignIn }));

import { MagicSignIn } from "./MagicSignIn";

describe("MagicSignIn", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows an error and does NOT call signIn when no token is present", () => {
    render(<MagicSignIn />);
    expect(screen.getByTestId("magic-error")).toBeInTheDocument();
    expect(screen.getByTestId("magic-retry")).toHaveAttribute("href", "/signin");
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("calls signIn('magic-link') with the token on mount (redirect:false)", async () => {
    mockSignIn.mockReturnValue(new Promise(() => {})); // never resolves → stays verifying
    render(<MagicSignIn token="abc123" />);
    expect(screen.getByTestId("magic-verifying")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith("magic-link", {
        token: "abc123",
        redirect: false,
      }),
    );
  });

  it("navigates to / on a successful sign-in", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<MagicSignIn token="abc123" />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    vi.unstubAllGlobals();
  });

  it("shows an error when signIn resolves with an error", async () => {
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin", ok: false });
    render(<MagicSignIn token="abc123" />);
    await waitFor(() => expect(screen.getByTestId("magic-error")).toBeInTheDocument());
  });

  it("shows an error when signIn resolves ok:true but with an error string", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: "CredentialsSignin" });
    render(<MagicSignIn token="abc123" />);
    await waitFor(() => expect(screen.getByTestId("magic-error")).toBeInTheDocument());
  });

  it("shows an error when signIn resolves with ok:false (no error string)", async () => {
    mockSignIn.mockResolvedValue({ ok: false });
    render(<MagicSignIn token="abc123" />);
    await waitFor(() => expect(screen.getByTestId("magic-error")).toBeInTheDocument());
  });

  it("shows an error when signIn rejects", async () => {
    mockSignIn.mockRejectedValue(new Error("network"));
    render(<MagicSignIn token="abc123" />);
    await waitFor(() => expect(screen.getByTestId("magic-error")).toBeInTheDocument());
  });
});
