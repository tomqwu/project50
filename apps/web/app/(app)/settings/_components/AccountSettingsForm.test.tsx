import { describe, expect, it, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const { mockAction } = vi.hoisted(() => ({ mockAction: vi.fn() }));

vi.mock("../actions", () => ({ updateAccountAction: mockAction }));

import { AccountSettingsForm } from "./AccountSettingsForm";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const initial = { handle: "alice", displayName: "Alice A" };

describe("AccountSettingsForm", () => {
  it("renders the initial values", () => {
    render(<AccountSettingsForm initial={initial} />);
    expect(screen.getByTestId("displayName-input")).toHaveValue("Alice A");
    expect(screen.getByTestId("handle-input")).toHaveValue("alice");
  });

  it("controls the displayName input", () => {
    render(<AccountSettingsForm initial={initial} />);
    const input = screen.getByTestId("displayName-input");
    fireEvent.change(input, { target: { value: "New Name" } });
    expect(input).toHaveValue("New Name");
  });

  it("controls the handle input", () => {
    render(<AccountSettingsForm initial={initial} />);
    const input = screen.getByTestId("handle-input");
    fireEvent.change(input, { target: { value: "new_handle" } });
    expect(input).toHaveValue("new_handle");
  });

  it("submits the trimmed values via the server action and shows success", async () => {
    mockAction.mockResolvedValue({
      ok: true,
      account: { handle: "alice_b", displayName: "Alice B" },
    });

    render(<AccountSettingsForm initial={initial} />);
    fireEvent.change(screen.getByTestId("displayName-input"), {
      target: { value: "  Alice B  " },
    });
    fireEvent.change(screen.getByTestId("handle-input"), {
      target: { value: "  alice_b  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledWith({
        displayName: "Alice B",
        handle: "alice_b",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-success")).toBeInTheDocument();
    });
    // inputs reflect the canonical returned values
    expect(screen.getByTestId("handle-input")).toHaveValue("alice_b");
    expect(screen.getByTestId("displayName-input")).toHaveValue("Alice B");
  });

  it("shows a client-side error when handle is empty", async () => {
    render(<AccountSettingsForm initial={initial} />);
    fireEvent.change(screen.getByTestId("handle-input"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toBeInTheDocument();
    });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("shows a client-side error when displayName is empty", async () => {
    render(<AccountSettingsForm initial={initial} />);
    fireEvent.change(screen.getByTestId("displayName-input"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toBeInTheDocument();
    });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("maps invalid_handle error from server to a friendly message", async () => {
    mockAction.mockResolvedValue({ ok: false, error: "invalid_handle" });

    render(<AccountSettingsForm initial={initial} />);
    fireEvent.change(screen.getByTestId("handle-input"), {
      target: { value: "ab" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent(
        /3.*30.*letters/i,
      );
    });
  });

  it("maps handle_taken error from server to a friendly message", async () => {
    mockAction.mockResolvedValue({ ok: false, error: "handle_taken" });

    render(<AccountSettingsForm initial={initial} />);
    fireEvent.change(screen.getByTestId("handle-input"), {
      target: { value: "bob" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent(/already taken/i);
    });
  });

  it("shows the raw error code for an unknown server error", async () => {
    mockAction.mockResolvedValue({ ok: false, error: "weird_code" });

    render(<AccountSettingsForm initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("weird_code");
    });
  });

  it("shows a generic error when the action throws", async () => {
    mockAction.mockRejectedValue(new Error("boom"));

    render(<AccountSettingsForm initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent(
        /Something went wrong/i,
      );
    });
  });

  it("disables the button and shows saving state while in flight", async () => {
    let resolve!: (v: unknown) => void;
    mockAction.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<AccountSettingsForm initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled();
    });

    resolve({ ok: true, account: initial });
    await waitFor(() => {
      expect(screen.getByTestId("form-success")).toBeInTheDocument();
    });
  });
});
