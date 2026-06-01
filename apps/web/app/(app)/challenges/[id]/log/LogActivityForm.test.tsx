import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { mockPush, mockFetch } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Override global fetch
globalThis.fetch = mockFetch;

import { LogActivityForm } from "./LogActivityForm";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("LogActivityForm — TARGET", () => {
  it("renders amount input and activity type chips", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    expect(screen.getByTestId("amount-input")).toBeInTheDocument();
    expect(screen.getByTestId("chip-run")).toBeInTheDocument();
    expect(screen.getByTestId("chip-bike")).toBeInTheDocument();
    expect(screen.getByTestId("chip-gym")).toBeInTheDocument();
    expect(screen.getByTestId("chip-yoga")).toBeInTheDocument();
  });

  it("does not render done toggle for TARGET", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    expect(screen.queryByTestId("done-toggle")).toBeNull();
  });

  it("shows unit in label when unit provided", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    expect(screen.getByText("Amount (km)")).toBeInTheDocument();
  });

  it("shows 'Amount' without unit when unit is null", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit={null} />);
    expect(screen.getByText("Amount")).toBeInTheDocument();
  });

  it("controls amount input", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    const input = screen.getByTestId("amount-input");
    fireEvent.change(input, { target: { value: "5.5" } });
    expect(input).toHaveValue(5.5);
  });

  it("submits correct JSON body and redirects on 201", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);

    // Select Run chip
    fireEvent.click(screen.getByTestId("chip-run"));
    // Set amount
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "5" } });
    // Set note
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "Great run" } });
    // Set mood 4
    fireEvent.click(screen.getByTestId("mood-4"));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/c1/activities",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.activityType).toBe("Run");
    expect(body.amount).toBe(5);
    expect(body.note).toBe("Great run");
    expect(body.mood).toBe(4);
    expect(body.dayKey).toMatch(/\d{4}-\d{2}-\d{2}/);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("shows 422 errors inline", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ code: "INVALID_ACTIVITY", detail: ["dayKey out of range", "amount required"] }),
    });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-errors")).toBeInTheDocument();
      expect(screen.getByText("dayKey out of range")).toBeInTheDocument();
      expect(screen.getByText("amount required")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows generic error on non-422 failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });

  it("shows network error on fetch exception", async () => {
    mockFetch.mockRejectedValue(new Error("network fail"));

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it("toggles activity type chip deselect", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    const chip = screen.getByTestId("chip-run");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip); // deselect
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles mood button deselect", () => {
    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    const mood = screen.getByTestId("mood-3");
    fireEvent.click(mood);
    expect(mood).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(mood); // deselect
    expect(mood).toHaveAttribute("aria-pressed", "false");
  });

  it("sends 422 string detail as array", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "single string error" }),
    });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText("single string error")).toBeInTheDocument();
    });
  });

  it("sends 422 with code when no detail", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ code: "SOME_CODE" }),
    });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText("SOME_CODE")).toBeInTheDocument();
    });
  });

  it("shows fallback 'Validation error' when 422 body has no detail and no code", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
    });

    render(<LogActivityForm challengeId="c1" goalType="TARGET" unit="km" />);
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      expect(screen.getByText("Validation error")).toBeInTheDocument();
    });
  });
});

describe("LogActivityForm — BINARY", () => {
  it("renders done toggle and no amount input", () => {
    render(<LogActivityForm challengeId="c1" goalType="BINARY" />);
    expect(screen.getByTestId("done-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("amount-input")).toBeNull();
  });

  it("controls done toggle", () => {
    render(<LogActivityForm challengeId="c1" goalType="BINARY" />);
    const toggle = screen.getByTestId("done-toggle");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("submits done=true and redirects on 201", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    render(<LogActivityForm challengeId="c1" goalType="BINARY" />);
    fireEvent.click(screen.getByTestId("done-toggle"));
    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.done).toBe(true);
      expect(body.amount).toBeUndefined();
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
