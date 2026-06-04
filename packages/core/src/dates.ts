/** A calendar day in `YYYY-MM-DD` form, interpreted in a challenge's timezone. */
export type DayKey = string;

const safeTimeZoneCache = new Map<string, string>();

/**
 * Returns `timeZone` if it is a valid IANA zone, otherwise `"UTC"`.
 *
 * A blank or malformed zone makes `Intl.DateTimeFormat({ timeZone })` throw a
 * RangeError. Routing EVERY Intl-timezone consumer through this helper means a
 * bad value that somehow got persisted can never crash day/hour computations —
 * they all degrade to UTC identically. Result is memoized; validity is probed
 * once per distinct input.
 */
export function safeTimeZone(timeZone: string | null | undefined): string {
  const key = timeZone ?? "";
  const cached = safeTimeZoneCache.get(key);
  if (cached !== undefined) return cached;

  const trimmed = key.trim();
  let resolved = "UTC";
  if (trimmed) {
    try {
      // Throws RangeError for an unknown/invalid zone.
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
      resolved = trimmed;
    } catch {
      resolved = "UTC";
    }
  }
  safeTimeZoneCache.set(key, resolved);
  return resolved;
}

/**
 * True if `timeZone` is a valid IANA zone that would be stored as-is. Useful for
 * input validation (reject/normalize before persisting).
 */
export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  return !!timeZone && timeZone.trim() !== "" && safeTimeZone(timeZone) === timeZone.trim();
}

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = dayKeyFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimeZone(timeZone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayKeyFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** The calendar day (YYYY-MM-DD) that `instant` falls on in `timeZone`. */
export function localDayKey(instant: Date, timeZone: string): DayKey {
  // en-CA formats as YYYY-MM-DD.
  return formatterFor(timeZone).format(instant);
}

function toUtcMillis(dayKey: DayKey): number {
  const parts = dayKey.split("-").map(Number) as [number, number, number];
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

const MS_PER_DAY = 86_400_000;

/** Returns a new day key `n` days after `dayKey` (n may be negative). */
export function addDays(dayKey: DayKey, n: number): DayKey {
  const dt = new Date(toUtcMillis(dayKey) + n * MS_PER_DAY);
  return dt.toISOString().slice(0, 10);
}

/** 1-based day index of `dayKey` within a challenge starting at `startDate`. 0 or negative if before start. */
export function dayNumber(startDate: DayKey, dayKey: DayKey): number {
  return Math.round((toUtcMillis(dayKey) - toUtcMillis(startDate)) / MS_PER_DAY) + 1;
}
