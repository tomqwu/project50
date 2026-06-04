/**
 * RNTL tests for ChallengeDetailScreen.
 * apiClient mocked. Covers:
 * - loading + load error
 * - detail view (TARGET + BINARY rendering)
 * - edit: open form, prefill, save success (TARGET payload), BINARY save, cancel,
 *   title validation, save error
 * - edit prefill when dailyTarget/unit are null
 * - delete: confirm prompt, delete success, delete error, cancel confirm
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";

jest.mock("../lib/apiClient", () => ({
  apiClient: {
    getChallenge: jest.fn(),
    updateChallenge: jest.fn(),
    deleteChallenge: jest.fn(),
  },
}));

import { apiClient } from "../lib/apiClient";
import { ChallengeDetailScreen } from "./ChallengeDetailScreen";

const mockGet = apiClient.getChallenge as jest.Mock;
const mockUpdate = apiClient.updateChallenge as jest.Mock;
const mockDelete = apiClient.deleteChallenge as jest.Mock;

const TARGET_CHALLENGE = {
  id: "c1",
  title: "Read 20 pages",
  goalType: "TARGET" as const,
  dailyTarget: 20,
  unit: "pages",
  startDate: "2026-06-01",
  lengthDays: 50,
  timezone: "UTC",
  visibility: "PRIVATE" as const,
  currentStreak: 3,
  longestStreak: 7,
  badges: 2,
  cheering: 1,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  activities: [],
  dayStatuses: [],
  milestones: [],
};

const BINARY_CHALLENGE = {
  ...TARGET_CHALLENGE,
  id: "c2",
  title: "Meditate",
  goalType: "BINARY" as const,
  dailyTarget: null,
  unit: null,
  visibility: "PUBLIC" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderLoaded(challenge: unknown): Promise<void> {
  mockGet.mockResolvedValueOnce(challenge);
  render(<ChallengeDetailScreen challengeId="c1" />);
  await waitFor(() => {
    expect(screen.getByTestId("detail-content")).toBeTruthy();
  });
}

describe("ChallengeDetailScreen — load", () => {
  it("shows loading indicator initially", () => {
    mockGet.mockReturnValueOnce(new Promise(() => undefined));
    render(<ChallengeDetailScreen challengeId="c1" />);
    expect(screen.getByTestId("detail-loading")).toBeTruthy();
  });

  it("shows error when load fails with Error", async () => {
    mockGet.mockRejectedValueOnce(new Error("Not found"));
    render(<ChallengeDetailScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByTestId("detail-error")).toBeTruthy();
    });
    expect(screen.getByText("Not found")).toBeTruthy();
  });

  it("shows fallback message when load fails with non-Error", async () => {
    mockGet.mockRejectedValueOnce("boom");
    render(<ChallengeDetailScreen challengeId="c1" />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load plan")).toBeTruthy();
    });
  });
});

describe("ChallengeDetailScreen — view", () => {
  it("renders TARGET challenge details", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    expect(screen.getByTestId("detail-title").props.children).toBe("Read 20 pages");
    expect(screen.getByText("Target: 20 pages")).toBeTruthy();
    expect(screen.getByText("Starts 2026-06-01 · 50 days")).toBeTruthy();
    expect(screen.getByText("Visibility: PRIVATE")).toBeTruthy();
    expect(screen.getByTestId("detail-streak").props.children).toBe(3);
    expect(screen.getByTestId("detail-longest").props.children).toBe(7);
    expect(screen.getByTestId("detail-badges").props.children).toBe(2);
  });

  it("renders BINARY goal label", async () => {
    mockGet.mockResolvedValueOnce(BINARY_CHALLENGE);
    render(<ChallengeDetailScreen challengeId="c2" />);
    await waitFor(() => {
      expect(screen.getByTestId("detail-content")).toBeTruthy();
    });
    expect(screen.getByText("Done / Not done")).toBeTruthy();
  });

  it("shows 0 target with no unit when dailyTarget/unit are null but TARGET", async () => {
    await renderLoaded({ ...TARGET_CHALLENGE, dailyTarget: null, unit: null });
    expect(screen.getByText("Target: 0")).toBeTruthy();
  });
});

describe("ChallengeDetailScreen — edit", () => {
  it("opens edit form prefilled and saves TARGET payload", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("edit-button"));

    expect(screen.getByTestId("detail-edit")).toBeTruthy();
    expect(screen.getByTestId("edit-title-input").props.value).toBe("Read 20 pages");
    expect(screen.getByTestId("edit-daily-target-input").props.value).toBe("20");
    expect(screen.getByTestId("edit-unit-input").props.value).toBe("pages");

    mockUpdate.mockResolvedValueOnce({ ...TARGET_CHALLENGE, title: "Read 30 pages", dailyTarget: 30 });

    fireEvent.changeText(screen.getByTestId("edit-title-input"), " Read 30 pages ");
    fireEvent.changeText(screen.getByTestId("edit-daily-target-input"), "30");
    fireEvent.press(screen.getByTestId("edit-visibility-PUBLIC"));
    fireEvent.press(screen.getByTestId("save-button"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("c1", {
        title: "Read 30 pages",
        dailyTarget: 30,
        unit: "pages",
        visibility: "PUBLIC",
      });
    });
    // back to detail view, reflecting updated title
    await waitFor(() => {
      expect(screen.getByTestId("detail-title").props.children).toBe("Read 30 pages");
    });
  });

  it("prefills empty daily target/unit when null", async () => {
    mockGet.mockResolvedValueOnce({ ...TARGET_CHALLENGE, dailyTarget: null, unit: null });
    render(<ChallengeDetailScreen challengeId="c1" />);
    await waitFor(() => expect(screen.getByTestId("detail-content")).toBeTruthy());
    fireEvent.press(screen.getByTestId("edit-button"));
    expect(screen.getByTestId("edit-daily-target-input").props.value).toBe("");
    expect(screen.getByTestId("edit-unit-input").props.value).toBe("");
  });

  it("omits daily target/unit when cleared in edit", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("edit-button"));
    mockUpdate.mockResolvedValueOnce(TARGET_CHALLENGE);
    fireEvent.changeText(screen.getByTestId("edit-daily-target-input"), "");
    fireEvent.changeText(screen.getByTestId("edit-unit-input"), "   ");
    fireEvent.press(screen.getByTestId("save-button"));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("c1", expect.objectContaining({
        dailyTarget: undefined,
        unit: undefined,
      }));
    });
  });

  it("hides TARGET edit fields and omits them for BINARY", async () => {
    mockGet.mockResolvedValueOnce(BINARY_CHALLENGE);
    render(<ChallengeDetailScreen challengeId="c2" />);
    await waitFor(() => expect(screen.getByTestId("detail-content")).toBeTruthy());
    fireEvent.press(screen.getByTestId("edit-button"));

    expect(screen.queryByTestId("edit-target-fields")).toBeNull();

    mockUpdate.mockResolvedValueOnce(BINARY_CHALLENGE);
    fireEvent.press(screen.getByTestId("save-button"));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("c2", {
        title: "Meditate",
        dailyTarget: undefined,
        unit: undefined,
        visibility: "PUBLIC",
      });
    });
  });

  it("validates title required in edit", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("edit-button"));
    fireEvent.changeText(screen.getByTestId("edit-title-input"), "   ");
    fireEvent.press(screen.getByTestId("save-button"));
    expect(screen.getByTestId("edit-error")).toBeTruthy();
    expect(screen.getByText("Title is required.")).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("shows error when save fails (Error and non-Error)", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("edit-button"));

    mockUpdate.mockRejectedValueOnce(new Error("Save boom"));
    fireEvent.press(screen.getByTestId("save-button"));
    await waitFor(() => expect(screen.getByText("Save boom")).toBeTruthy());

    mockUpdate.mockRejectedValueOnce("nope");
    fireEvent.press(screen.getByTestId("save-button"));
    await waitFor(() => expect(screen.getByText("Failed to save plan")).toBeTruthy());
  });

  it("shows Saving... during save", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("edit-button"));

    let resolve!: (v: unknown) => void;
    mockUpdate.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("save-button"));
    });
    expect(screen.getByText("Saving...")).toBeTruthy();
    await act(async () => {
      resolve(TARGET_CHALLENGE);
    });
  });

  it("cancels edit and returns to detail view", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("edit-button"));
    fireEvent.press(screen.getByTestId("cancel-edit-button"));
    expect(screen.getByTestId("detail-content")).toBeTruthy();
  });
});

describe("ChallengeDetailScreen — delete", () => {
  it("prompts for confirmation then deletes", async () => {
    const onDeleted = jest.fn();
    mockGet.mockResolvedValueOnce(TARGET_CHALLENGE);
    render(<ChallengeDetailScreen challengeId="c1" onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getByTestId("detail-content")).toBeTruthy());

    fireEvent.press(screen.getByTestId("delete-button"));
    expect(screen.getByTestId("delete-confirm")).toBeTruthy();

    mockDelete.mockResolvedValueOnce({ ok: true });
    fireEvent.press(screen.getByTestId("confirm-delete-button"));

    await waitFor(() => {
      expect(screen.getByTestId("detail-deleted")).toBeTruthy();
    });
    expect(mockDelete).toHaveBeenCalledWith("c1");
    expect(onDeleted).toHaveBeenCalled();
  });

  it("shows Deleting... during delete", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("delete-button"));

    let resolve!: (v: unknown) => void;
    mockDelete.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-delete-button"));
    });
    expect(screen.getByText("Deleting...")).toBeTruthy();
    await act(async () => {
      resolve({ ok: true });
    });
  });

  it("shows error when delete fails (Error and non-Error) and returns to view", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("delete-button"));

    mockDelete.mockRejectedValueOnce(new Error("Delete boom"));
    fireEvent.press(screen.getByTestId("confirm-delete-button"));
    await waitFor(() => expect(screen.getByText("Delete boom")).toBeTruthy());
    // confirm closed, back to detail action buttons
    expect(screen.getByTestId("delete-button")).toBeTruthy();

    fireEvent.press(screen.getByTestId("delete-button"));
    mockDelete.mockRejectedValueOnce("nope");
    fireEvent.press(screen.getByTestId("confirm-delete-button"));
    await waitFor(() => expect(screen.getByText("Failed to delete plan")).toBeTruthy());
  });

  it("cancels delete confirmation", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("delete-button"));
    fireEvent.press(screen.getByTestId("cancel-delete-button"));
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
    expect(screen.getByTestId("delete-button")).toBeTruthy();
  });

  // ─── Accessibility ──────────────────────────────────────────────────────────

  it("exposes the detail actions as accessible buttons", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    expect(screen.getByRole("button", { name: "Edit plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete plan" })).toBeTruthy();
    expect(screen.getByLabelText("Streak: 3")).toBeTruthy();
    expect(screen.getByLabelText("Best streak: 7")).toBeTruthy();
  });

  it("exposes edit-form visibility options as radios and labels its inputs", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("edit-button"));

    const priv = screen.getByTestId("edit-visibility-PRIVATE");
    expect(priv.props.accessibilityRole).toBe("radio");
    expect(priv.props.accessibilityState).toMatchObject({ selected: true });

    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("marks the save button busy while saving", async () => {
    await renderLoaded(TARGET_CHALLENGE);
    fireEvent.press(screen.getByTestId("edit-button"));

    let resolve!: (v: unknown) => void;
    mockUpdate.mockReturnValueOnce(new Promise((r) => { resolve = r; }));

    await act(async () => {
      fireEvent.press(screen.getByTestId("save-button"));
    });

    expect(screen.getByTestId("save-button").props.accessibilityState?.busy).toBe(true);

    await act(async () => {
      resolve({ ...TARGET_CHALLENGE });
    });
  });
});
