import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";

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
    vi.unstubAllGlobals();
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

  // ── Email magic-link option (#50) ──────────────────────────────────────────

  it("does NOT render the email form when emailEnabled is false (default)", () => {
    render(<SignInButtons />);
    expect(screen.queryByTestId("signin-email-form")).toBeNull();
  });

  it("renders the email form when emailEnabled is true", () => {
    render(<SignInButtons emailEnabled />);
    expect(screen.getByTestId("signin-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("signin-email-submit")).toHaveTextContent(
      "Email me a sign-in link",
    );
  });

  it("POSTs the email and shows the sent confirmation on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sent: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SignInButtons emailEnabled />);
    fireEvent.change(screen.getByTestId("signin-email-input"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.submit(screen.getByTestId("signin-email-form"));

    await waitFor(() =>
      expect(screen.getByTestId("signin-email-sent")).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/magic-link/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "alice@example.com" }),
      }),
    );
  });

  it("shows an error when the request returns sent:false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sent: false }), { status: 200 }),
      ),
    );
    render(<SignInButtons emailEnabled />);
    fireEvent.change(screen.getByTestId("signin-email-input"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.submit(screen.getByTestId("signin-email-form"));
    await waitFor(() =>
      expect(screen.getByTestId("signin-email-error")).toBeInTheDocument(),
    );
  });

  it("shows an error when the request responds non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "INVALID_EMAIL" }), { status: 422 }),
      ),
    );
    render(<SignInButtons emailEnabled />);
    fireEvent.change(screen.getByTestId("signin-email-input"), {
      target: { value: "bad@" },
    });
    fireEvent.submit(screen.getByTestId("signin-email-form"));
    await waitFor(() =>
      expect(screen.getByTestId("signin-email-error")).toBeInTheDocument(),
    );
  });

  it("shows an error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<SignInButtons emailEnabled />);
    fireEvent.change(screen.getByTestId("signin-email-input"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.submit(screen.getByTestId("signin-email-form"));
    await waitFor(() =>
      expect(screen.getByTestId("signin-email-error")).toBeInTheDocument(),
    );
  });

  it("falls back to {} when the response body is not JSON (treated as not sent)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json{", { status: 200 })),
    );
    render(<SignInButtons emailEnabled />);
    fireEvent.change(screen.getByTestId("signin-email-input"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.submit(screen.getByTestId("signin-email-form"));
    await waitFor(() =>
      expect(screen.getByTestId("signin-email-error")).toBeInTheDocument(),
    );
  });

  it("shows the sending label while the request is in flight", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r))),
    );
    render(<SignInButtons emailEnabled />);
    fireEvent.change(screen.getByTestId("signin-email-input"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.submit(screen.getByTestId("signin-email-form"));
    await waitFor(() =>
      expect(screen.getByTestId("signin-email-submit")).toHaveTextContent("Sending…"),
    );
    resolve(new Response(JSON.stringify({ sent: true }), { status: 200 }));
    await waitFor(() =>
      expect(screen.getByTestId("signin-email-sent")).toBeInTheDocument(),
    );
  });
});
