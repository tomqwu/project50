import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  CookieConsent,
  CONSENT_KEY,
  getConsent,
  hasTrackingConsent,
} from "./CookieConsent";

// jsdom only enables localStorage when given an origin; this environment runs
// without one, so install a minimal in-memory Storage mock for the suite.
beforeAll(() => {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: mock,
  });
});

describe("CookieConsent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  describe("getConsent", () => {
    it("returns null when no choice has been stored", () => {
      expect(getConsent()).toBeNull();
    });

    it("returns the stored choice when 'accepted'", () => {
      localStorage.setItem(CONSENT_KEY, "accepted");
      expect(getConsent()).toBe("accepted");
    });

    it("returns the stored choice when 'rejected'", () => {
      localStorage.setItem(CONSENT_KEY, "rejected");
      expect(getConsent()).toBe("rejected");
    });

    it("treats an unrecognized stored value as no choice", () => {
      localStorage.setItem(CONSENT_KEY, "garbage");
      expect(getConsent()).toBeNull();
    });

    it("returns null when localStorage access throws", () => {
      const original = localStorage.getItem;
      localStorage.getItem = () => {
        throw new Error("denied");
      };
      try {
        expect(getConsent()).toBeNull();
      } finally {
        localStorage.getItem = original;
      }
    });
  });

  describe("hasTrackingConsent", () => {
    it("is true only when the choice is 'accepted'", () => {
      localStorage.setItem(CONSENT_KEY, "accepted");
      expect(hasTrackingConsent()).toBe(true);
    });

    it("is false when the choice is 'rejected'", () => {
      localStorage.setItem(CONSENT_KEY, "rejected");
      expect(hasTrackingConsent()).toBe(false);
    });

    it("is false when no choice has been made", () => {
      expect(hasTrackingConsent()).toBe(false);
    });
  });

  describe("banner", () => {
    it("shows when no choice has been made", () => {
      render(<CookieConsent />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("is hidden when a choice already exists", () => {
      localStorage.setItem(CONSENT_KEY, "accepted");
      render(<CookieConsent />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("links to the privacy policy", () => {
      render(<CookieConsent />);
      const link = screen.getByRole("link", { name: /privacy/i });
      expect(link).toHaveAttribute("href", "/legal/privacy");
    });

    it("persists 'accepted' and hides on Accept all", () => {
      render(<CookieConsent />);
      fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
      expect(localStorage.getItem(CONSENT_KEY)).toBe("accepted");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("persists 'rejected' and hides on Reject non-essential", () => {
      render(<CookieConsent />);
      fireEvent.click(
        screen.getByRole("button", { name: /reject non-essential/i }),
      );
      expect(localStorage.getItem(CONSENT_KEY)).toBe("rejected");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("swallows write failures so a choice click never crashes", () => {
      const original = localStorage.setItem;
      localStorage.setItem = () => {
        throw new Error("quota");
      };
      try {
        render(<CookieConsent />);
        fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
        // Banner still hides even though persistence failed.
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      } finally {
        localStorage.setItem = original;
      }
    });
  });
});
