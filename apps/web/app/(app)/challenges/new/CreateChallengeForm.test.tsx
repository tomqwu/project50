import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { mockPush, mockFetch } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

globalThis.fetch = mockFetch;

import { CreateChallengeForm } from "./CreateChallengeForm";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("CreateChallengeForm — TARGET mode", () => {
  it("renders all TARGET fields by default", () => {
    render(<CreateChallengeForm />);
    expect(screen.getByTestId("title-input")).toBeInTheDocument();
    expect(screen.getByTestId("unit-input")).toBeInTheDocument();
    expect(screen.getByTestId("daily-target-input")).toBeInTheDocument();
    expect(screen.getByTestId("start-date-input")).toBeInTheDocument();
    expect(screen.getByTestId("timezone-input")).toBeInTheDocument();
    expect(screen.getByTestId("visibility-select")).toBeInTheDocument();
  });

  it("hides TARGET-only fields when BINARY is selected", () => {
    render(<CreateChallengeForm />);
    fireEvent.click(screen.getByTestId("goaltype-binary"));
    expect(screen.queryByTestId("unit-input")).toBeNull();
    expect(screen.queryByTestId("daily-target-input")).toBeNull();
  });

  it("shows TARGET-only fields when TARGET is reselected", () => {
    render(<CreateChallengeForm />);
    fireEvent.click(screen.getByTestId("goaltype-binary"));
    fireEvent.click(screen.getByTestId("goaltype-target"));
    expect(screen.getByTestId("unit-input")).toBeInTheDocument();
    expect(screen.getByTestId("daily-target-input")).toBeInTheDocument();
  });

  it("submits correct body for TARGET and redirects on 201", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    render(<CreateChallengeForm />);

    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run 5K" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("start-date-input"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByTestId("timezone-input"), { target: { value: "America/New_York" } });
    fireEvent.change(screen.getByTestId("visibility-select"), { target: { value: "PUBLIC" } });

    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const firstCall = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(firstCall[1].body);
    expect(body.title).toBe("Run 5K");
    expect(body.goalType).toBe("TARGET");
    expect(body.unit).toBe("km");
    expect(body.dailyTarget).toBe(5);
    expect(body.startDate).toBe("2026-06-01");
    expect(body.timezone).toBe("America/New_York");
    expect(body.visibility).toBe("PUBLIC");

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("submits correct body for BINARY (no unit/dailyTarget)", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    render(<CreateChallengeForm />);

    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Meditate" } });
    fireEvent.click(screen.getByTestId("goaltype-binary"));

    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const firstCall = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(firstCall[1].body);
    expect(body.goalType).toBe("BINARY");
    expect(body.unit).toBeUndefined();
    expect(body.dailyTarget).toBeUndefined();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("shows client-side error when title is empty", async () => {
    render(<CreateChallengeForm />);
    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-errors")).toBeInTheDocument();
      expect(screen.getByText("title is required")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows client-side error when TARGET missing unit", async () => {
    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });
    // unit is left empty

    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-errors")).toBeInTheDocument();
      expect(screen.getByText("unit is required")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows client-side error when TARGET dailyTarget is 0", async () => {
    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-errors")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows client-side error when TARGET dailyTarget is empty", async () => {
    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    // dailyTarget left empty

    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-errors")).toBeInTheDocument();
      expect(screen.getByText("dailyTarget must be > 0")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows 422 errors inline from server", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        code: "INVALID_CHALLENGE",
        detail: ["title is required", "unit is required"],
      }),
    });

    render(<CreateChallengeForm />);
    // Fill minimum to pass client validation
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-errors")).toBeInTheDocument();
      expect(screen.getByText("title is required")).toBeInTheDocument();
      expect(screen.getByText("unit is required")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows 422 with string detail from server", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "single string error" }),
    });

    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByText("single string error")).toBeInTheDocument();
    });
  });

  it("shows 422 fallback to code when no detail", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ code: "SOME_CODE" }),
    });

    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByText("SOME_CODE")).toBeInTheDocument();
    });
  });

  it("shows 422 fallback 'Validation error' when no detail no code", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
    });

    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByText("Validation error")).toBeInTheDocument();
    });
  });

  it("shows generic error on non-422 failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });

  it("shows network error on fetch exception", async () => {
    mockFetch.mockRejectedValue(new Error("network fail"));

    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it("controls title input", () => {
    render(<CreateChallengeForm />);
    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "My challenge" } });
    expect(input).toHaveValue("My challenge");
  });

  it("controls unit input", () => {
    render(<CreateChallengeForm />);
    const input = screen.getByTestId("unit-input");
    fireEvent.change(input, { target: { value: "pages" } });
    expect(input).toHaveValue("pages");
  });

  it("controls daily target input", () => {
    render(<CreateChallengeForm />);
    const input = screen.getByTestId("daily-target-input");
    fireEvent.change(input, { target: { value: "10" } });
    expect(input).toHaveValue(10);
  });

  it("controls visibility select", () => {
    render(<CreateChallengeForm />);
    const select = screen.getByTestId("visibility-select");
    fireEvent.change(select, { target: { value: "PRIVATE" } });
    expect(select).toHaveValue("PRIVATE");
  });

  it("controls timezone input", () => {
    render(<CreateChallengeForm />);
    const input = screen.getByTestId("timezone-input");
    fireEvent.change(input, { target: { value: "Europe/London" } });
    expect(input).toHaveValue("Europe/London");
  });

  it("controls start date input", () => {
    render(<CreateChallengeForm />);
    const input = screen.getByTestId("start-date-input");
    fireEvent.change(input, { target: { value: "2026-07-01" } });
    expect(input).toHaveValue("2026-07-01");
  });

  it("shows 'Creating…' while submitting", async () => {
    let resolveReq!: (val: unknown) => void;
    mockFetch.mockReturnValue(new Promise((r) => { resolveReq = r; }));

    render(<CreateChallengeForm />);
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "km" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /Create challenge/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Creating…/i })).toBeDisabled();
    });

    // Resolve and cleanup
    resolveReq({ ok: true, status: 201 });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
