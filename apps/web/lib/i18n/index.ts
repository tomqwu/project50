/**
 * Lightweight, dependency-free internationalization (i18n) foundation.
 *
 * Goals:
 * - No runtime dependencies — just typed dictionaries and a dot-path lookup.
 * - Type-safe keys: `MessageKey` is the union of every valid `"group.key"`
 *   dot-path derived from the `en` dictionary, so typos are compile errors.
 * - Graceful fallback: a missing key resolves to the key string itself.
 *
 * ## Adding a locale
 *
 * 1. Add a new dictionary to `./messages.ts`, e.g.:
 *
 *        export const fr: Messages = {
 *          welcome: { badge: "Bienvenue", title: "Projet 50", ... },
 *        };
 *
 *    Typing it as `Messages` forces it to cover every key in `en`.
 * 2. Extend the `Locale` union below to include `"fr"`.
 * 3. Register it in the `dictionaries` map below.
 * 4. Declare its text direction in `LOCALE_DIRECTION` below (e.g. an RTL
 *    locale such as `"ar"` maps to `"rtl"`).
 *
 * Everything else (`t`, `getMessages`, `localeDirection`) keeps working
 * unchanged.
 */
import { en, type Messages } from "./messages";

/** Supported locales. Extend this union when adding a locale. */
export type Locale = "en";

/** A document/text direction: left-to-right or right-to-left. */
export type Direction = "ltr" | "rtl";

/** The default locale used when none is provided. */
export const DEFAULT_LOCALE: Locale = "en";

/** Registry of locale dictionaries. Add new locales here. */
const dictionaries: Record<Locale, Messages> = {
  en,
};

/**
 * Text direction for each supported locale.
 *
 * Typing this as `Record<Locale, Direction>` forces every locale in the union
 * to declare a direction, so adding a locale without one is a compile error.
 * Latin-script locales use `"ltr"`; to add a right-to-left locale, extend the
 * `Locale` union and add an entry here, e.g. `ar: "rtl"`.
 */
export const LOCALE_DIRECTION: Record<Locale, Direction> = {
  en: "ltr",
};

/**
 * Every valid dot-path key, e.g. `"welcome.title"`. Derived from `en` so the
 * type stays in sync with the dictionary automatically.
 */
export type MessageKey = {
  [Group in keyof typeof en]: `${Group & string}.${keyof (typeof en)[Group] & string}`;
}[keyof typeof en];

/**
 * Return the full message dictionary for a locale. Falls back to the default
 * locale when an unknown locale is requested.
 */
export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/**
 * Look up a translated string by dot-path key for the given locale.
 *
 * Returns the resolved string, or — if the key does not resolve to a string —
 * the key itself, so a missing translation is visible but never crashes.
 */
export function t(key: MessageKey, locale: Locale = DEFAULT_LOCALE): string {
  const messages = getMessages(locale);
  const segments = (key as string).split(".");

  let current: unknown = messages;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" ? current : key;
}

/**
 * Return the text direction (`"ltr"` or `"rtl"`) for a locale.
 *
 * Falls back to `"ltr"` for an unknown locale, so the document always has a
 * sensible direction even if an unsupported locale slips through. Set the
 * resulting value on `<html dir>` so the whole document renders in the right
 * direction (RTL locales flip the layout).
 */
export function localeDirection(locale: Locale = DEFAULT_LOCALE): Direction {
  return LOCALE_DIRECTION[locale] ?? "ltr";
}
