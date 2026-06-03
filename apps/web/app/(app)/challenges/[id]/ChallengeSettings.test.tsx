import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { mockPush, mockRefresh, mockFetch } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

globalThis.fetch = mockFetch;

import { ChallengeSettings } from "./ChallengeSettings";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderTarget(overrides: Record<string, unknown> = {}) {
  return render(
    <ChallengeSettings
      id="c1"
      title="Run 5K"
      goalType="TARGET"
      unit="km"
      dailyTarget={5}
      visibility="PUBLIC"
      {...overrides}
    />,
  );
}

describe("ChallengeSettings — render", () => {
  it("pre-fills the form with the challenge's values", () => {
    renderTarget();
    expect(screen.getByTestId("title-input")).toHaveValue("Run 5K");
    expect(screen.getByTestId("unit-input")).toHaveValue("km");
    expect(screen.getByTestId("daily-target-input")).toHaveValue(5);
    expect(screen.getByTestId("visibility-select")).toHaveValue("PUBLIC");
  });

  it("hides unit/dailyTarget for BINARY challenges", () => {
    renderTarget({ goalType: "BINARY", unit: null, dailyTarget: null });
    expect(screen.queryByTestId("unit-input")).toBeNull();
    expect(screen.queryByTestId("daily-target-input")).toBeNull();
    expect(screen.getByTestId("title-input")).toBeInTheDocument();
  });

  it("handles null unit/dailyTarget without crashing (empty fields)", () => {
    renderTarget({ unit: null, dailyTarget: null });
    expect(screen.getByTestId("unit-input")).toHaveValue("");
    expect(screen.getByTestId("daily-target-input")).toHaveValue(null);
  });

  it("controls each input", () => {
    renderTarget();
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "New" } });
    expect(screen.getByTestId("title-input")).toHaveValue("New");
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "miles" } });
    expect(screen.getByTestId("unit-input")).toHaveValue("miles");
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "9" } });
    expect(screen.getByTestId("daily-target-input")).toHaveValue(9);
    fireEvent.change(screen.getByTestId("visibility-select"), { target: { value: "PRIVATE" } });
    expect(screen.getByTestId("visibility-select")).toHaveValue("PRIVATE");
  });
});

describe("ChallengeSettings — save (PATCH)", () => {
  it("sends a PATCH with edited fields and refreshes on success", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    renderTarget();

    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Run 10K" } });
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "miles" } });
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("visibility-select"), { target: { value: "PRIVATE" } });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/c1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const call = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    expect(body.title).toBe("Run 10K");
    expect(body.unit).toBe("miles");
    expect(body.dailyTarget).toBe(10);
    expect(body.visibility).toBe("PRIVATE");

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("omits unit/dailyTarget for BINARY challenges", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    renderTarget({ goalType: "BINARY", unit: null, dailyTarget: null });

    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Meditate" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const call = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    expect(body.title).toBe("Meditate");
    expect(body.unit).toBeUndefined();
    expect(body.dailyTarget).toBeUndefined();
  });

  it("shows client error and does not fetch when title is empty", async () => {
    renderTarget();
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => {
      expect(screen.getByText("title is required")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows client error when TARGET unit is empty", async () => {
    renderTarget();
    fireEvent.change(screen.getByTestId("unit-input"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => {
      expect(screen.getByText("unit is required")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows client error when TARGET dailyTarget <= 0", async () => {
    renderTarget();
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => {
      expect(screen.getByText("dailyTarget must be > 0")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("renders 422 detail array from server", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "INVALID_CHALLENGE", detail: ["title is required"] }),
    });
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("form-errors")).toBeInTheDocument();
      expect(screen.getByText("title is required")).toBeInTheDocument();
    });
  });

  it("renders 422 string detail from server", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "one error" }),
    });
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getByText("one error")).toBeInTheDocument());
  });

  it("falls back to error code on 422 with no detail", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "SOME_CODE" }),
    });
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getByText("SOME_CODE")).toBeInTheDocument());
  });

  it("falls back to 'Validation error' on 422 with no detail and no error code", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({}) });
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getByText("Validation error")).toBeInTheDocument());
  });

  it("shows a generic error on non-422 failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getByText(/Something went wrong/)).toBeInTheDocument());
  });

  it("shows a network error when the save fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getByText(/Network error/)).toBeInTheDocument());
  });

  it("disables the button and shows 'Saving…' while in flight", async () => {
    let resolveReq!: (val: unknown) => void;
    mockFetch.mockReturnValue(new Promise((r) => { resolveReq = r; }));
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Saving…/i })).toBeDisabled();
    });
    resolveReq({ ok: true, status: 200 });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });
});

describe("ChallengeSettings — delete (DELETE)", () => {
  it("requires confirmation before deleting", () => {
    renderTarget();
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Delete challenge$/i }));
    expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("cancels the confirmation", () => {
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /^Delete challenge$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
    expect(screen.getByRole("button", { name: /^Delete challenge$/i })).toBeInTheDocument();
  });

  it("sends DELETE and routes home on success", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /^Delete challenge$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, delete/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/challenges/c1", { method: "DELETE" });
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("shows an error when delete fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /^Delete challenge$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, delete/i }));
    await waitFor(() => {
      expect(screen.getByText(/Could not delete/)).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows a network error when the delete fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /^Delete challenge$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, delete/i }));
    await waitFor(() => expect(screen.getByText(/Network error/)).toBeInTheDocument());
  });

  it("disables and shows 'Deleting…' while in flight", async () => {
    let resolveReq!: (val: unknown) => void;
    mockFetch.mockReturnValue(new Promise((r) => { resolveReq = r; }));
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: /^Delete challenge$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, delete/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Deleting…/i })).toBeDisabled();
    });
    resolveReq({ ok: true, status: 200 });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });
});
