import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

const { mockRegister } = vi.hoisted(() => ({
  mockRegister: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

describe("ServiceWorkerRegister", () => {
  it("registers the service worker when serviceWorker is supported", async () => {
    mockRegister.mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: mockRegister },
      configurable: true,
      writable: true,
    });

    await act(async () => {
      render(<ServiceWorkerRegister />);
    });

    expect(mockRegister).toHaveBeenCalledWith("/sw.js");
  });

  it("does not register when serviceWorker is not in navigator", async () => {
    // Completely remove the serviceWorker key from navigator
    // We do this by temporarily overriding 'in' check using a custom global
    const savedDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

    // Delete the property to make 'serviceWorker' not in navigator
    delete (navigator as Record<string, unknown>).serviceWorker;

    await act(async () => {
      render(<ServiceWorkerRegister />);
    });

    expect(mockRegister).not.toHaveBeenCalled();

    // Restore
    if (savedDescriptor) {
      Object.defineProperty(navigator, "serviceWorker", savedDescriptor);
    }
  });

  it("renders null (no visible output)", async () => {
    mockRegister.mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: mockRegister },
      configurable: true,
      writable: true,
    });

    let container!: HTMLElement;
    await act(async () => {
      const result = render(<ServiceWorkerRegister />);
      container = result.container;
    });

    expect(container.firstChild).toBeNull();
  });

  it("handles registration failure silently (no throw)", async () => {
    mockRegister.mockRejectedValue(new Error("SW registration failed"));
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: mockRegister },
      configurable: true,
      writable: true,
    });

    // Should not throw
    await act(async () => {
      render(<ServiceWorkerRegister />);
    });

    // Give time for the rejected promise to be caught
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRegister).toHaveBeenCalledWith("/sw.js");
  });
});
