import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

import { ModerationActions } from "./ModerationActions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true } as Response)),
  );
});

function blockButton() {
  return screen.getByRole("button", { name: /block/i });
}
function reportButton() {
  return screen.getByRole("button", { name: /report/i });
}

describe("ModerationActions — block", () => {
  it("renders 'Block' by default", () => {
    render(<ModerationActions targetId="u1" />);
    expect(blockButton()).toHaveTextContent("Block");
  });

  it("renders 'Unblock' when initially blocked", () => {
    render(<ModerationActions targetId="u1" initialBlocked />);
    expect(screen.getByRole("button", { name: /unblock/i })).toHaveTextContent(
      "Unblock",
    );
  });

  it("POSTs to the block route and toggles to 'Unblock'", async () => {
    render(<ModerationActions targetId="u1" />);

    fireEvent.click(blockButton());

    expect(fetch).toHaveBeenCalledWith("/api/users/u1/block", { method: "POST" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /unblock/i })).toBeInTheDocument(),
    );
  });

  it("DELETEs the block route and toggles back to 'Block'", async () => {
    render(<ModerationActions targetId="u1" initialBlocked />);

    fireEvent.click(screen.getByRole("button", { name: /unblock/i }));

    expect(fetch).toHaveBeenCalledWith("/api/users/u1/block", {
      method: "DELETE",
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^block$/i })).toBeInTheDocument(),
    );
  });

  it("reverts the optimistic block toggle when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false } as Response)),
    );
    render(<ModerationActions targetId="u1" />);

    fireEvent.click(blockButton());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^block$/i })).toBeInTheDocument(),
    );
  });

  it("reverts the optimistic block toggle when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    render(<ModerationActions targetId="u1" initialBlocked />);

    fireEvent.click(screen.getByRole("button", { name: /unblock/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /unblock/i })).toBeInTheDocument(),
    );
  });
});

describe("ModerationActions — report", () => {
  it("POSTs a report and shows a confirmation", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("spam");
    render(<ModerationActions targetId="u1" />);

    fireEvent.click(reportButton());

    expect(fetch).toHaveBeenCalledWith("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType: "USER", targetId: "u1", reason: "spam" }),
    });
    await waitFor(() =>
      expect(screen.getByTestId("report-confirmation")).toBeInTheDocument(),
    );
  });

  it("does nothing when the prompt is cancelled", () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    render(<ModerationActions targetId="u1" />);

    fireEvent.click(reportButton());

    expect(fetch).not.toHaveBeenCalled();
  });

  it("does nothing when the reason is empty", () => {
    vi.spyOn(window, "prompt").mockReturnValue("   ");
    render(<ModerationActions targetId="u1" />);

    fireEvent.click(reportButton());

    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows an error when the report request is not ok", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("abuse");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false } as Response)),
    );
    render(<ModerationActions targetId="u1" />);

    fireEvent.click(reportButton());

    await waitFor(() =>
      expect(screen.getByTestId("report-error")).toBeInTheDocument(),
    );
  });

  it("shows an error when the report fetch throws", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("abuse");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    render(<ModerationActions targetId="u1" />);

    fireEvent.click(reportButton());

    await waitFor(() =>
      expect(screen.getByTestId("report-error")).toBeInTheDocument(),
    );
  });
});
