/** A calendar day in `YYYY-MM-DD` form, interpreted in a challenge's timezone. */
export type DayKey = string;

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = dayKeyFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
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
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
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
