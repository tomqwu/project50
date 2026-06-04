/**
 * RNTL tests for CreateChallengeScreen.
 * apiClient mocked. Covers:
 * - default render (TARGET fields shown, startDate defaulted)
 * - goalType toggle hides/shows TARGET fields
 * - visibility toggle
 * - title required validation
 * - successful create posts correct payload (TARGET + BINARY)
 * - omits dailyTarget/unit when empty or BINARY
 * - success state + onCreated callback
 * - error mapping (422 message, 422 status object, generic, non-Error)
 * - submitting state
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";

jest.mock("../lib/apiClient", () => ({
  apiClient: {
    createChallenge: jest.fn(),
  },
}));

// Freeze localDayKey so startDate default is deterministic.
jest.mock("@project50/core", () => ({
  localDayKey: jest.fn(() => "2026-06-04"),
}));

import { apiClient } from "../lib/apiClient";
import { CreateChallengeScreen } from "./CreateChallengeScreen";

const mockCreate = apiClient.createChallenge as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CreateChallengeScreen — render", () => {
  it("renders heading and title input", () => {
    render(<CreateChallengeScreen />);
    expect(screen.getByTestId("create-heading")).toBeTruthy();
    expect(screen.getByTestId("title-input")).toBeTruthy();
  });

  it("defaults startDate to today's local day key", () => {
    render(<CreateChallengeScreen />);
    expect(screen.getByTestId("start-date-input").props.value).toBe("2026-06-04");
  });

  it("shows TARGET fields by default", () => {
    render(<CreateChallengeScreen />);
    expect(screen.getByTestId("target-fields")).toBeTruthy();
    expect(screen.getByTestId("daily-target-input")).toBeTruthy();
    expect(screen.getByTestId("unit-input")).toBeTruthy();
  });

  it("hides TARGET fields when BINARY selected, shows again on TARGET", () => {
    render(<CreateChallengeScreen />);
    fireEvent.press(screen.getByTestId("goal-BINARY"));
    expect(screen.queryByTestId("target-fields")).toBeNull();
    fireEvent.press(screen.getByTestId("goal-TARGET"));
    expect(screen.getByTestId("target-fields")).toBeTruthy();
  });

  it("renders visibility options and allows selecting", () => {
    render(<CreateChallengeScreen />);
    expect(screen.getByTestId("visibility-PUBLIC")).toBeTruthy();
    expect(screen.getByTestId("visibility-FOLLOWERS")).toBeTruthy();
    expect(screen.getByTestId("visibility-PRIVATE")).toBeTruthy();
    fireEvent.press(screen.getByTestId("visibility-PUBLIC"));
    // selection reflected on submit (covered in submit tests)
  });
});

describe("CreateChallengeScreen — validation", () => {
  it("shows error when title is empty/whitespace and does not call API", () => {
    render(<CreateChallengeScreen />);
    fireEvent.changeText(screen.getByTestId("title-input"), "   ");
    fireEvent.press(screen.getByTestId("submit-button"));
    expect(screen.getByTestId("errors-container")).toBeTruthy();
    expect(screen.getByText("Title is required.")).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("CreateChallengeScreen — submit", () => {
  it("creates a TARGET plan with full payload", async () => {
    mockCreate.mockResolvedValueOnce({ id: "c1", title: "Read 20 pages" });

    render(<CreateChallengeScreen />);
    fireEvent.changeText(screen.getByTestId("title-input"), "  Read 20 pages  ");
    fireEvent.changeText(screen.getByTestId("daily-target-input"), "20");
    fireEvent.changeText(screen.getByTestId("unit-input"), " pages ");
    fireEvent.press(screen.getByTestId("visibility-PUBLIC"));
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        title: "Read 20 pages",
        goalType: "TARGET",
        dailyTarget: 20,
        unit: "pages",
        startDate: "2026-06-04",
        visibility: "PUBLIC",
      });
    });
  });

  it("omits dailyTarget and unit when left empty for TARGET", async () => {
    mockCreate.mockResolvedValueOnce({ id: "c1", title: "Walk" });

    render(<CreateChallengeScreen />);
    fireEvent.changeText(screen.getByTestId("title-input"), "Walk");
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ dailyTarget: undefined, unit: undefined }),
      );
    });
  });

  it("omits dailyTarget and unit for BINARY even if filled before switching", async () => {
    mockCreate.mockResolvedValueOnce({ id: "c2", title: "Meditate" });

    render(<CreateChallengeScreen />);
    fireEvent.changeText(screen.getByTestId("title-input"), "Meditate");
    fireEvent.changeText(screen.getByTestId("daily-target-input"), "10");
    fireEvent.press(screen.getByTestId("goal-BINARY"));
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          goalType: "BINARY",
          dailyTarget: undefined,
          unit: undefined,
        }),
      );
    });
  });

  it("shows success state and calls onCreated", async () => {
    const onCreated = jest.fn();
    mockCreate.mockResolvedValueOnce({ id: "c3", title: "Run" });

    render(<CreateChallengeScreen onCreated={onCreated} />);
    fireEvent.changeText(screen.getByTestId("title-input"), "Run");
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("create-success")).toBeTruthy();
    });
    expect(screen.getByTestId("created-title").props.children).toBe("Run");
    expect(onCreated).toHaveBeenCalledWith({ id: "c3", title: "Run" });
  });
});

describe("CreateChallengeScreen — errors", () => {
  function renderAndSubmit(): void {
    render(<CreateChallengeScreen />);
    fireEvent.changeText(screen.getByTestId("title-input"), "Plan");
    fireEvent.press(screen.getByTestId("submit-button"));
  }

  it("maps Error containing 422 to validation message", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API error 422: INVALID_CHALLENGE"));
    renderAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Validation failed. Please check your input.")).toBeTruthy();
    });
  });

  it("maps object with status 422 to validation message", async () => {
    mockCreate.mockRejectedValueOnce({ status: 422, code: "INVALID_CHALLENGE" });
    renderAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Validation failed. Please check your input.")).toBeTruthy();
    });
  });

  it("shows Error.message for generic errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Network down"));
    renderAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Network down")).toBeTruthy();
    });
  });

  it("shows generic message for non-Error throws", async () => {
    mockCreate.mockRejectedValueOnce("boom");
    renderAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Failed to create plan")).toBeTruthy();
    });
  });
});

describe("CreateChallengeScreen — submitting state", () => {
  it("shows Creating... and disables button during submit", async () => {
    let resolve!: (v: unknown) => void;
    mockCreate.mockReturnValueOnce(new Promise((r) => { resolve = r; }));

    render(<CreateChallengeScreen />);
    fireEvent.changeText(screen.getByTestId("title-input"), "Plan");

    await act(async () => {
      fireEvent.press(screen.getByTestId("submit-button"));
    });

    expect(screen.getByText("Creating...")).toBeTruthy();
    expect(screen.getByTestId("submit-button").props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId("submit-button").props.accessibilityState?.busy).toBe(true);

    await act(async () => {
      resolve({ id: "c9", title: "Plan" });
    });
  });

  // ─── Accessibility ──────────────────────────────────────────────────────────

  it("exposes goal-type and visibility options as radios with selected state", () => {
    render(<CreateChallengeScreen />);

    const target = screen.getByTestId("goal-TARGET");
    expect(target.props.accessibilityRole).toBe("radio");
    expect(target.props.accessibilityState).toMatchObject({ selected: true });

    const binary = screen.getByTestId("goal-BINARY");
    expect(binary.props.accessibilityState).toMatchObject({ selected: false });

    fireEvent.press(binary);
    expect(screen.getByTestId("goal-BINARY").props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it("labels text inputs and the submit button for screen readers", () => {
    render(<CreateChallengeScreen />);
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create plan" })).toBeTruthy();
    expect(screen.getByTestId("title-input").props.accessibilityLabelledBy).toBe(
      "create-title-label",
    );
  });

  it("marks the heading as a header", () => {
    render(<CreateChallengeScreen />);
    expect(screen.getByRole("header", { name: "Create custom plan" })).toBeTruthy();
  });
});
