import { describe, expect, it, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const { mockAction } = vi.hoisted(() => ({ mockAction: vi.fn() }));

vi.mock("../actions", () => ({ updateNotificationPrefsAction: mockAction }));

import { NotificationPrefsSection } from "./NotificationPrefsSection";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const offPrefs = {
  remindersEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};
const windowPrefs = {
  remindersEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

function saveButton() {
  return screen.getByRole("button", { name: /save|saving/i });
}

describe("NotificationPrefsSection", () => {
  it("renders defaults: reminders on, quiet hours off", () => {
    render(<NotificationPrefsSection initial={offPrefs} />);
    expect(screen.getByTestId("reminders-enabled-input")).toBeChecked();
    expect(screen.getByTestId("quiet-start-input")).toHaveValue("");
    expect(screen.getByTestId("quiet-end-input")).toHaveValue("");
  });

  it("hydrates an existing window and disabled reminders", () => {
    render(<NotificationPrefsSection initial={windowPrefs} />);
    expect(screen.getByTestId("reminders-enabled-input")).not.toBeChecked();
    expect(screen.getByTestId("quiet-start-input")).toHaveValue("22");
    expect(screen.getByTestId("quiet-end-input")).toHaveValue("7");
  });

  it("toggles the reminders checkbox", () => {
    render(<NotificationPrefsSection initial={offPrefs} />);
    const cb = screen.getByTestId("reminders-enabled-input");
    fireEvent.click(cb);
    expect(cb).not.toBeChecked();
  });

  it("submits a full window and shows success, hydrating from the result", async () => {
    mockAction.mockResolvedValue({ ok: true, prefs: windowPrefs });
    render(<NotificationPrefsSection initial={offPrefs} />);

    fireEvent.click(screen.getByTestId("reminders-enabled-input"));
    fireEvent.change(screen.getByTestId("quiet-start-input"), {
      target: { value: "22" },
    });
    fireEvent.change(screen.getByTestId("quiet-end-input"), {
      target: { value: "7" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledWith({
        remindersEnabled: false,
        quietHoursStart: 22,
        quietHoursEnd: 7,
      });
      expect(
        screen.getByTestId("notification-prefs-success"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("quiet-start-input")).toHaveValue("22");
    expect(screen.getByTestId("quiet-end-input")).toHaveValue("7");
  });

  it("clears the window to null when only one bound is set", async () => {
    mockAction.mockResolvedValue({ ok: true, prefs: offPrefs });
    render(<NotificationPrefsSection initial={offPrefs} />);

    // Only set start; end stays Off → whole window must be cleared.
    fireEvent.change(screen.getByTestId("quiet-start-input"), {
      target: { value: "22" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledWith({
        remindersEnabled: true,
        quietHoursStart: null,
        quietHoursEnd: null,
      });
    });
    // Result has null bounds → selects hydrate back to Off.
    await waitFor(() => {
      expect(screen.getByTestId("quiet-start-input")).toHaveValue("");
    });
  });

  it("shows a validation error returned by the action", async () => {
    mockAction.mockResolvedValue({ ok: false, error: "invalid_quiet_hours" });
    render(<NotificationPrefsSection initial={offPrefs} />);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByTestId("notification-prefs-error"),
      ).toHaveTextContent(/whole hours between 0 and 23/i);
    });
  });

  it("falls back to the raw code for an unknown error", async () => {
    mockAction.mockResolvedValue({ ok: false, error: "weird_code" });
    render(<NotificationPrefsSection initial={offPrefs} />);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByTestId("notification-prefs-error")).toHaveTextContent(
        "weird_code",
      );
    });
  });

  it("shows a generic error when the action throws", async () => {
    mockAction.mockRejectedValue(new Error("network"));
    render(<NotificationPrefsSection initial={offPrefs} />);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByTestId("notification-prefs-error")).toHaveTextContent(
        /something went wrong/i,
      );
    });
  });

  it("disables the button while saving", async () => {
    let resolve!: (v: unknown) => void;
    mockAction.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<NotificationPrefsSection initial={offPrefs} />);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(saveButton()).toBeDisabled();
      expect(saveButton()).toHaveTextContent(/saving/i);
    });

    resolve({ ok: true, prefs: offPrefs });
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });
});
