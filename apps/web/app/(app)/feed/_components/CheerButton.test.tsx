import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
globalThis.fetch = mockFetch;

import { CheerButton } from "./CheerButton";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("CheerButton", () => {
  it("renders with initial count", () => {
    render(<CheerButton activityId="a1" count={5} />);
    expect(screen.getByTestId("cheer-count")).toHaveTextContent("5");
    expect(screen.getByTestId("cheer-button")).not.toBeDisabled();
  });

  it("optimistically increments count on click and posts CHEER", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    render(<CheerButton activityId="a1" count={5} />);

    fireEvent.click(screen.getByTestId("cheer-button"));

    // Optimistic update immediately
    expect(screen.getByTestId("cheer-count")).toHaveTextContent("6");

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/activities/a1/reactions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ kind: "CHEER" }),
        }),
      );
    });
  });

  it("disables button after cheering", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    render(<CheerButton activityId="a1" count={3} />);

    fireEvent.click(screen.getByTestId("cheer-button"));

    await waitFor(() => {
      expect(screen.getByTestId("cheer-button")).toBeDisabled();
    });
  });

  it("reverts optimistic increment on network error", async () => {
    mockFetch.mockRejectedValue(new Error("network fail"));
    render(<CheerButton activityId="a1" count={5} />);

    fireEvent.click(screen.getByTestId("cheer-button"));

    // Optimistic: 6
    expect(screen.getByTestId("cheer-count")).toHaveTextContent("6");

    // After error: reverted to 5
    await waitFor(() => {
      expect(screen.getByTestId("cheer-count")).toHaveTextContent("5");
    });
  });

  it("does not fire fetch if already cheered", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    render(<CheerButton activityId="a1" count={5} />);

    // First cheer
    fireEvent.click(screen.getByTestId("cheer-button"));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Second click — button is disabled, no additional fetch
    fireEvent.click(screen.getByTestId("cheer-button"));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
