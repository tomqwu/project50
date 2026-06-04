/**
 * RNTL tests for LogActivityScreen.
 * apiClient + photo mocked. Tests:
 * - submit posts correct payload incl media
 * - 422 shows errors
 * - photo flow sets media
 * - BINARY done toggle
 * - mood chip selection
 * - note input
 * - success state
 * - error for non-ApiError
 */

import React from "react";
import { Alert } from "react-native";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";

// Mock apiClient
jest.mock("../lib/apiClient", () => ({
  apiClient: {
    logActivity: jest.fn(),
    presignUpload: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message?: string) {
      super(message ?? `API error ${status}: ${code}`);
      this.status = status;
      this.code = code;
    }
  },
}));

// Mock photo module
jest.mock("../lib/photo", () => ({
  pickImageFromLibrary: jest.fn(),
  pickImageFromCamera: jest.fn(),
  uploadPhoto: jest.fn(),
}));

import { apiClient } from "../lib/apiClient";
import { pickImageFromCamera, pickImageFromLibrary, uploadPhoto } from "../lib/photo";
import { LogActivityScreen } from "./LogActivityScreen";

const mockLogActivity = apiClient.logActivity as jest.Mock;
const mockPickImage = pickImageFromLibrary as jest.Mock;
const mockPickCamera = pickImageFromCamera as jest.Mock;
const mockUploadPhoto = uploadPhoto as jest.Mock;

// ─── Default props ────────────────────────────────────────────────────────────

const TARGET_PROPS = {
  challengeId: "c1",
  goalType: "TARGET" as const,
  dailyTarget: 5,
  unit: "km",
  dayKey: "2026-01-15",
};

const BINARY_PROPS = {
  challengeId: "c1",
  goalType: "BINARY" as const,
  dayKey: "2026-01-15",
};

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

describe("LogActivityScreen — TARGET", () => {
  it("renders heading for TARGET with unit", () => {
    render(<LogActivityScreen {...TARGET_PROPS} />);
    expect(screen.getByTestId("log-heading")).toBeTruthy();
    expect(screen.getByText("Log km")).toBeTruthy();
  });

  it("renders heading 'Log progress' when unit is undefined", () => {
    const props = { ...TARGET_PROPS, unit: undefined };
    render(<LogActivityScreen {...props} />);
    expect(screen.getByText("Log progress")).toBeTruthy();
  });

  it("renders amount label without unit suffix when unit is undefined", () => {
    const props = { ...TARGET_PROPS, unit: undefined };
    render(<LogActivityScreen {...props} />);
    expect(screen.getByText("Amount")).toBeTruthy();
  });

  it("uses 0 as dailyTarget placeholder when dailyTarget is undefined", () => {
    const props = { ...TARGET_PROPS, dailyTarget: undefined };
    render(<LogActivityScreen {...props} />);
    const input = screen.getByTestId("amount-input");
    expect(input.props.placeholder).toBe("Target: 0");
  });

  it("renders amount input with target placeholder", () => {
    render(<LogActivityScreen {...TARGET_PROPS} />);
    expect(screen.getByTestId("amount-input")).toBeTruthy();
  });

  it("renders submit button", () => {
    render(<LogActivityScreen {...TARGET_PROPS} />);
    expect(screen.getByTestId("submit-button")).toBeTruthy();
    expect(screen.getByText("Log Activity")).toBeTruthy();
  });

  it("submits correct payload with amount, note, mood", async () => {
    mockLogActivity.mockResolvedValueOnce({
      activity: { id: "a1" },
      dayStatus: { dayKey: "2026-01-15", completed: false },
      newMilestones: [],
    });

    render(<LogActivityScreen {...TARGET_PROPS} />);

    fireEvent.changeText(screen.getByTestId("amount-input"), "3");
    fireEvent.changeText(screen.getByTestId("note-input"), "Good run!");
    fireEvent.press(screen.getByTestId("mood-4"));

    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith("c1", {
        dayKey: "2026-01-15",
        amount: 3,
        done: undefined,
        note: "Good run!",
        mood: 4,
        media: undefined,
      });
    });
  });

  it("shows success state after submission", async () => {
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("log-success")).toBeTruthy();
    });
    expect(screen.getByText("Activity logged!")).toBeTruthy();
  });

  it("calls onSuccess callback when submission succeeds", async () => {
    const onSuccess = jest.fn();
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} onSuccess={onSuccess} />);
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("shows error when submission throws (non-422)", async () => {
    mockLogActivity.mockRejectedValueOnce(new Error("Network error"));

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("errors-container")).toBeTruthy();
    });
    expect(screen.getByText("Network error")).toBeTruthy();
  });

  it("shows validation error for 422 ApiError (message contains 422)", async () => {
    const err = new Error("API error 422: INVALID_ACTIVITY");
    mockLogActivity.mockRejectedValueOnce(err);

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("errors-container")).toBeTruthy();
    });
    expect(screen.getByText("Validation failed. Please check your input.")).toBeTruthy();
  });

  it("shows validation error for object with status 422", async () => {
    const err = { status: 422, code: "INVALID_ACTIVITY", message: "invalid" };
    mockLogActivity.mockRejectedValueOnce(err);

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("errors-container")).toBeTruthy();
    });
    expect(screen.getByText("Validation failed. Please check your input.")).toBeTruthy();
  });

  it("shows generic error for non-Error throws", async () => {
    mockLogActivity.mockRejectedValueOnce("something went wrong");

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("errors-container")).toBeTruthy();
    });
    expect(screen.getByText("Failed to log activity")).toBeTruthy();
  });

  it("submits undefined amount when amount input is empty", async () => {
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);
    // Don't enter amount
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        amount: undefined,
      }));
    });
  });

  it("omits note from payload when note is empty/whitespace", async () => {
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.changeText(screen.getByTestId("note-input"), "   ");
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        note: undefined,
      }));
    });
  });

  it("omits mood from payload when none selected", async () => {
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        mood: undefined,
      }));
    });
  });
});

// ─── BINARY challenge ─────────────────────────────────────────────────────────

describe("LogActivityScreen — BINARY", () => {
  it("renders done toggle instead of amount input", () => {
    render(<LogActivityScreen {...BINARY_PROPS} />);
    expect(screen.getByTestId("done-toggle")).toBeTruthy();
    expect(screen.queryByTestId("amount-input")).toBeNull();
  });

  it("toggles done on press", async () => {
    render(<LogActivityScreen {...BINARY_PROPS} />);
    expect(screen.getByText("Mark as done")).toBeTruthy();
    fireEvent.press(screen.getByTestId("done-toggle"));
    expect(screen.getByText("Done!")).toBeTruthy();
    // Toggle back
    fireEvent.press(screen.getByTestId("done-toggle"));
    expect(screen.getByText("Mark as done")).toBeTruthy();
  });

  it("submits done=true when toggled", async () => {
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...BINARY_PROPS} />);
    fireEvent.press(screen.getByTestId("done-toggle"));
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        done: true,
        amount: undefined,
      }));
    });
  });

  it("submits done=false when not toggled", async () => {
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...BINARY_PROPS} />);
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        done: false,
      }));
    });
  });

  it("renders heading without unit for BINARY", () => {
    render(<LogActivityScreen {...BINARY_PROPS} />);
    expect(screen.getByText("Log activity")).toBeTruthy();
  });
});

// ─── Mood selection ───────────────────────────────────────────────────────────

describe("LogActivityScreen — mood", () => {
  it("renders 5 mood chips", () => {
    render(<LogActivityScreen {...TARGET_PROPS} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`mood-${i}`)).toBeTruthy();
    }
  });

  it("selects a mood on press", async () => {
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.press(screen.getByTestId("mood-3"));
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        mood: 3,
      }));
    });
  });

  it("deselects mood when pressing same chip again", async () => {
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);
    fireEvent.press(screen.getByTestId("mood-3"));
    fireEvent.press(screen.getByTestId("mood-3")); // deselect
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        mood: undefined,
      }));
    });
  });
});

// ─── Photo flow ───────────────────────────────────────────────────────────────

describe("LogActivityScreen — photo", () => {
  it("renders Add photo and Take photo buttons", () => {
    render(<LogActivityScreen {...TARGET_PROPS} />);
    expect(screen.getByTestId("add-photo-button")).toBeTruthy();
    expect(screen.getByTestId("take-photo-button")).toBeTruthy();
    expect(screen.getByText("Add photo")).toBeTruthy();
    expect(screen.getByText("Take photo")).toBeTruthy();
  });

  it("shows photo preview after capturing from camera", async () => {
    mockPickCamera.mockResolvedValueOnce({
      uri: "file:///tmp/camera.jpg",
      width: 1200,
      height: 900,
      mimeType: "image/jpeg",
    });

    render(<LogActivityScreen {...TARGET_PROPS} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("take-photo-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeTruthy();
    });
    expect(mockPickCamera).toHaveBeenCalledTimes(1);
    expect(mockPickImage).not.toHaveBeenCalled();
    // Buttons swap to "retake" / "change" labels once a photo exists.
    expect(screen.getByText("Retake photo")).toBeTruthy();
    expect(screen.getByText("Change photo")).toBeTruthy();
  });

  it("does not show preview when camera capture is cancelled", async () => {
    mockPickCamera.mockResolvedValueOnce(null);

    render(<LogActivityScreen {...TARGET_PROPS} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("take-photo-button"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("photo-preview")).toBeNull();
    });
  });

  it("shows alert when camera capture throws", async () => {
    mockPickCamera.mockRejectedValueOnce(new Error("Camera unavailable"));

    render(<LogActivityScreen {...TARGET_PROPS} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("take-photo-button"));
    });

    expect(Alert.alert).toHaveBeenCalledWith("Photo error", "Camera unavailable");
  });

  it("uploads a camera-captured photo on submit", async () => {
    mockPickCamera.mockResolvedValueOnce({
      uri: "file:///tmp/camera.jpg",
      width: 1200,
      height: 900,
      mimeType: "image/jpeg",
    });
    mockUploadPhoto.mockResolvedValueOnce({
      objectKey: "media/u1/activity-2026-01-15.jpg",
      width: 1200,
      height: 900,
    });
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("take-photo-button"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockUploadPhoto).toHaveBeenCalledWith(
        apiClient,
        "file:///tmp/camera.jpg",
        "image/jpeg",
        "jpg",
        "activity-2026-01-15",
        1200,
        900,
      );
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        media: [{ objectKey: "media/u1/activity-2026-01-15.jpg", width: 1200, height: 900 }],
      }));
    });
  });

  it("shows photo preview after picking", async () => {
    mockPickImage.mockResolvedValueOnce({
      uri: "file:///tmp/photo.jpg",
      width: 1080,
      height: 720,
      mimeType: "image/jpeg",
    });

    render(<LogActivityScreen {...TARGET_PROPS} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-photo-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeTruthy();
    });
    expect(screen.getByText("Change photo")).toBeTruthy();
  });

  it("does not show preview when pick is cancelled", async () => {
    mockPickImage.mockResolvedValueOnce(null);

    render(<LogActivityScreen {...TARGET_PROPS} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-photo-button"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("photo-preview")).toBeNull();
    });
  });

  it("shows Error.message in alert when pickImage throws an Error", async () => {
    mockPickImage.mockRejectedValueOnce(new Error("Camera denied"));

    render(<LogActivityScreen {...TARGET_PROPS} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-photo-button"));
    });

    expect(Alert.alert).toHaveBeenCalledWith("Photo error", "Camera denied");
  });

  it("shows generic message in alert when pickImage throws a non-Error", async () => {
    // Throw a non-Error to cover the 'Could not pick photo' branch
    mockPickImage.mockRejectedValueOnce("string error");

    render(<LogActivityScreen {...TARGET_PROPS} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-photo-button"));
    });

    expect(Alert.alert).toHaveBeenCalledWith("Photo error", "Could not pick photo");
    expect(screen.queryByTestId("photo-preview")).toBeNull();
  });

  it("uploads photo and includes media in logActivity payload", async () => {
    mockPickImage.mockResolvedValueOnce({
      uri: "file:///tmp/photo.jpg",
      width: 1080,
      height: 720,
      mimeType: "image/jpeg",
    });
    mockUploadPhoto.mockResolvedValueOnce({
      objectKey: "media/u1/activity-2026-01-15.jpg",
      width: 1080,
      height: 720,
    });
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);

    // Pick photo
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-photo-button"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeTruthy();
    });

    // Submit
    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockUploadPhoto).toHaveBeenCalledWith(
        apiClient,
        "file:///tmp/photo.jpg",
        "image/jpeg",
        "jpg",
        "activity-2026-01-15",
        1080,
        720,
      );
      expect(mockLogActivity).toHaveBeenCalledWith("c1", expect.objectContaining({
        media: [{ objectKey: "media/u1/activity-2026-01-15.jpg", width: 1080, height: 720 }],
      }));
    });
  });

  it("uses .png ext for png photos", async () => {
    mockPickImage.mockResolvedValueOnce({
      uri: "file:///tmp/photo.png",
      width: 800,
      height: 600,
      mimeType: "image/png",
    });
    mockUploadPhoto.mockResolvedValueOnce({
      objectKey: "media/u1/activity-2026-01-15.png",
      width: 800,
      height: 600,
    });
    mockLogActivity.mockResolvedValueOnce({ activity: {}, dayStatus: {}, newMilestones: [] });

    render(<LogActivityScreen {...TARGET_PROPS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("add-photo-button"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockUploadPhoto).toHaveBeenCalledWith(
        apiClient,
        "file:///tmp/photo.png",
        "image/png",
        "png",
        "activity-2026-01-15",
        800,
        600,
      );
    });
  });

  it("shows error when uploadPhoto fails", async () => {
    mockPickImage.mockResolvedValueOnce({
      uri: "file:///tmp/photo.jpg",
      width: 1080,
      height: 720,
      mimeType: "image/jpeg",
    });
    mockUploadPhoto.mockRejectedValueOnce(new Error("Upload failed"));

    render(<LogActivityScreen {...TARGET_PROPS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("add-photo-button"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("photo-preview")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("errors-container")).toBeTruthy();
    });
    expect(screen.getByText("Upload failed")).toBeTruthy();
  });
});

// ─── Submitting state ─────────────────────────────────────────────────────────

describe("LogActivityScreen — submitting state", () => {
  it("shows Logging... text during submission", async () => {
    let resolveLog!: (v: unknown) => void;
    mockLogActivity.mockReturnValueOnce(new Promise((r) => { resolveLog = r; }));

    render(<LogActivityScreen {...TARGET_PROPS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("submit-button"));
    });

    expect(screen.getByText("Logging...")).toBeTruthy();
    // Submit button exposes disabled + busy state
    expect(screen.getByTestId("submit-button").props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId("submit-button").props.accessibilityState?.busy).toBe(true);

    // Resolve and clean up
    await act(async () => {
      resolveLog({ activity: {}, dayStatus: {}, newMilestones: [] });
    });
  });
});

describe("LogActivityScreen — accessibility", () => {
  it("exposes mood chips as radios with a spoken name and selected state", () => {
    render(<LogActivityScreen {...TARGET_PROPS} />);

    const great = screen.getByTestId("mood-5");
    expect(great.props.accessibilityRole).toBe("radio");
    expect(great.props.accessibilityLabel).toBe("Great");
    expect(great.props.accessibilityState).toMatchObject({ selected: false });

    fireEvent.press(great);
    expect(screen.getByTestId("mood-5").props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it("exposes the BINARY done toggle as a checkbox with checked state", () => {
    render(<LogActivityScreen {...BINARY_PROPS} />);

    const toggle = screen.getByTestId("done-toggle");
    expect(toggle.props.accessibilityRole).toBe("checkbox");
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });

    fireEvent.press(toggle);
    expect(screen.getByTestId("done-toggle").props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it("labels photo buttons and a selected photo for screen readers", async () => {
    mockPickImage.mockResolvedValueOnce({
      uri: "file://p.jpg",
      width: 10,
      height: 10,
      mimeType: "image/jpeg",
    });
    render(<LogActivityScreen {...TARGET_PROPS} />);

    expect(screen.getByRole("button", { name: "Take photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("add-photo-button"));
    });

    const preview = screen.getByTestId("photo-preview");
    expect(preview.props.accessibilityRole).toBe("image");
    expect(preview.props.accessibilityLabel).toBe("Selected activity photo");
  });

  it("labels the amount input and marks the heading as a header", () => {
    render(<LogActivityScreen {...TARGET_PROPS} />);
    const amount = screen.getByTestId("amount-input");
    expect(amount.props.accessibilityLabel).toBe("Amount in km");
    expect(amount.props.accessibilityLabelledBy).toBe("log-amount-label");
    expect(screen.getByRole("header")).toBeTruthy();
  });
});
