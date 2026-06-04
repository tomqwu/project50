/** A calendar day in `YYYY-MM-DD` form, interpreted in a challenge's timezone. */
export type DayKey = string;

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

function buildFormatter(timeZone: string): Intl.DateTimeFormat {
  // A blank or malformed timeZone makes `Intl.DateTimeFormat` throw a
  // RangeError. Fall back to UTC so every caller is safe even when the stored
  // challenge timezone is empty or invalid (defensive root guard).
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone.trim() || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = dayKeyFormatters.get(timeZone);
  if (!fmt) {
    fmt = buildFormatter(timeZone);
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
