import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { mockClipboardWriteText, mockNavigatorShare } = vi.hoisted(() => ({
  mockClipboardWriteText: vi.fn(),
  mockNavigatorShare: vi.fn(),
}));

// Setup navigator mocks before import
beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: { origin: "https://project50.app" },
    configurable: true,
    writable: true,
  });

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockClipboardWriteText },
    configurable: true,
    writable: true,
  });
});

import { ShareActions } from "./ShareActions";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const defaultProps = {
  challengeId: "c1",
  shareId: "share-abc",
  visibility: "PUBLIC" as const,
};

describe("ShareActions — PUBLIC visibility", () => {
  it("renders Save image link (enabled) pointing to card route with download", () => {
    render(<ShareActions {...defaultProps} />);
    const link = screen.getByTestId("save-image-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/api/challenges/c1/card");
    expect(link).toHaveAttribute("download");
  });

  it("renders Public link button (enabled)", () => {
    render(<ShareActions {...defaultProps} />);
    const wrapper = screen.getByTestId("copy-link-button");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveTextContent("Public link");
    // The inner button should not be disabled
    const btn = wrapper.querySelector("button");
    expect(btn).not.toBeDisabled();
  });

  it("renders Share button (enabled)", () => {
    render(<ShareActions {...defaultProps} />);
    const wrapper = screen.getByTestId("share-button");
    const btn = wrapper.querySelector("button");
    expect(btn).not.toBeDisabled();
  });

  it("copies correct URL and shows 'Copied' when clicking Public link", async () => {
    mockClipboardWriteText.mockResolvedValue(undefined);

    render(<ShareActions {...defaultProps} />);
    const wrapper = screen.getByTestId("copy-link-button");
    fireEvent.click(wrapper.querySelector("button")!);

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        "https://project50.app/c/share-abc",
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("copy-link-button")).toHaveTextContent("Copied");
    });
  });

  it("calls navigator.share when available", async () => {
    mockNavigatorShare.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockNavigatorShare,
      configurable: true,
      writable: true,
    });
    mockClipboardWriteText.mockResolvedValue(undefined);

    render(<ShareActions {...defaultProps} />);
    const wrapper = screen.getByTestId("share-button");
    fireEvent.click(wrapper.querySelector("button")!);

    await waitFor(() => {
      expect(mockNavigatorShare).toHaveBeenCalledWith({
        url: "https://project50.app/c/share-abc",
      });
    });
    // Should NOT fall back to clipboard
    expect(mockClipboardWriteText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard copy when navigator.share is not available", async () => {
    // Remove navigator.share
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    mockClipboardWriteText.mockResolvedValue(undefined);

    render(<ShareActions {...defaultProps} />);
    const wrapper = screen.getByTestId("share-button");
    fireEvent.click(wrapper.querySelector("button")!);

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        "https://project50.app/c/share-abc",
      );
    });

    await waitFor(() => {
      // "Copied" should show (share fallback sets copied)
      expect(screen.getByTestId("copy-link-button")).toHaveTextContent("Copied");
    });
  });
});

describe("ShareActions — non-PUBLIC visibility", () => {
  it("renders disabled Save image wrapper with hint when PRIVATE", () => {
    render(<ShareActions {...defaultProps} visibility="PRIVATE" />);
    expect(screen.getByTestId("save-image-disabled")).toBeInTheDocument();
    // The inner button should be disabled
    const btn = screen.getByTestId("save-image-disabled").querySelector("button");
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("save-image-hint")).toHaveTextContent("Make public to share");
  });

  it("renders disabled Public link button when FOLLOWERS", () => {
    render(<ShareActions {...defaultProps} visibility="FOLLOWERS" />);
    const wrapper = screen.getByTestId("copy-link-button");
    const btn = wrapper.querySelector("button");
    expect(btn).toBeDisabled();
  });

  it("renders disabled Share button when PRIVATE", () => {
    render(<ShareActions {...defaultProps} visibility="PRIVATE" />);
    const wrapper = screen.getByTestId("share-button");
    const btn = wrapper.querySelector("button");
    expect(btn).toBeDisabled();
  });

  it("does NOT render Save image link (download anchor) when PRIVATE", () => {
    render(<ShareActions {...defaultProps} visibility="PRIVATE" />);
    expect(screen.queryByTestId("save-image-link")).toBeNull();
  });
});
