import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, getMessages, t, type Locale, type MessageKey } from "./index";
import { en } from "./messages";

describe("i18n", () => {
  describe("DEFAULT_LOCALE", () => {
    it("is 'en'", () => {
      expect(DEFAULT_LOCALE).toBe("en");
    });
  });

  describe("getMessages", () => {
    it("returns the en dictionary by default", () => {
      expect(getMessages()).toBe(en);
    });

    it("returns the dictionary for an explicit locale", () => {
      expect(getMessages("en")).toBe(en);
    });

    it("falls back to the default dictionary for an unknown locale", () => {
      // Cast to exercise the runtime fallback for a locale missing from the
      // registry (not currently reachable through the typed union).
      expect(getMessages("xx" as Locale)).toBe(en);
    });
  });

  describe("t", () => {
    it("resolves a known dot-path key", () => {
      expect(t("welcome.title")).toBe(en.welcome.title);
      expect(t("welcome.cta")).toBe(en.welcome.cta);
    });

    it("resolves a key for an explicitly passed locale", () => {
      expect(t("welcome.badge", "en")).toBe(en.welcome.badge);
    });

    it("returns the key itself when the top-level group is missing", () => {
      const missing = "nope.title" as MessageKey;
      expect(t(missing)).toBe("nope.title");
    });

    it("returns the key itself when a nested key is missing", () => {
      const missing = "welcome.nope" as MessageKey;
      expect(t(missing)).toBe("welcome.nope");
    });

    it("returns the key when the path resolves to a non-string value", () => {
      // "welcome" alone resolves to an object, not a leaf string.
      const groupOnly = "welcome" as MessageKey;
      expect(t(groupOnly)).toBe("welcome");
    });
  });
});
