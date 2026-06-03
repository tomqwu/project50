import { describe, expect, it, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const { mockAction } = vi.hoisted(() => ({ mockAction: vi.fn() }));

vi.mock("../actions", () => ({ deleteAccountAction: mockAction }));

import { DeleteAccountSection } from "./DeleteAccountSection";

/** The delete button has no testid (the shared Button strips extra props), so
 * select it by accessible name in either its idle or in-flight label. */
function deleteButton() {
  return screen.getByRole("button", { name: /delete my account|deleting/i });
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("DeleteAccountSection", () => {
  it("renders the danger zone heading", () => {
    render(<DeleteAccountSection handle="alice" />);
    expect(screen.getByText(/danger zone/i)).toBeInTheDocument();
  });

  it("keeps the delete button disabled until the handle is typed", () => {
    render(<DeleteAccountSection handle="alice" />);
    expect(deleteButton()).toBeDisabled();

    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "alice" },
    });
    expect(deleteButton()).toBeEnabled();
  });

  it("does not enable the button for a wrong handle", () => {
    render(<DeleteAccountSection handle="alice" />);
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "bob" },
    });
    expect(deleteButton()).toBeDisabled();
  });

  it("does not fire the action while the confirm gate is unmet", () => {
    render(<DeleteAccountSection handle="alice" />);
    // Button is disabled, but force-fire submit to prove the guard holds.
    fireEvent.submit(screen.getByTestId("delete-account-form"));
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("calls deleteAccountAction once the handle matches and button is clicked", async () => {
    mockAction.mockResolvedValue(undefined);

    render(<DeleteAccountSection handle="alice" />);
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "alice" },
    });
    fireEvent.click(deleteButton());

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a deleting state and disables the button while in flight", async () => {
    let resolve!: (v: unknown) => void;
    mockAction.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<DeleteAccountSection handle="alice" />);
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "alice" },
    });
    fireEvent.click(deleteButton());

    await waitFor(() => {
      expect(deleteButton()).toBeDisabled();
      expect(deleteButton()).toHaveTextContent(
        /deleting/i,
      );
    });

    resolve(undefined);
  });

  it("shows an error if the action throws", async () => {
    mockAction.mockRejectedValue(new Error("boom"));

    render(<DeleteAccountSection handle="alice" />);
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "alice" },
    });
    fireEvent.click(deleteButton());

    await waitFor(() => {
      expect(screen.getByTestId("delete-error")).toHaveTextContent(
        /something went wrong/i,
      );
    });
    // The button is re-enabled so the user can retry.
    expect(deleteButton()).toBeEnabled();
  });
});
