import { addDays, type DayKey } from "./dates";

/** Consecutive completed days ending exactly at `asOf` (0 if `asOf` itself isn't completed). */
export function currentStreak(completedDays: DayKey[], asOf: DayKey): number {
  const set = new Set(completedDays);
  let streak = 0;
  let cursor = asOf;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Length of the longest run of consecutive completed calendar days. */
export function longestStreak(completedDays: DayKey[]): number {
  const set = new Set(completedDays);
  let longest = 0;
  for (const day of set) {
    // Only start counting at the beginning of a run.
    if (set.has(addDays(day, -1))) continue;
    let run = 1;
    let cursor = addDays(day, 1);
    while (set.has(cursor)) {
      run += 1;
      cursor = addDays(cursor, 1);
    }
    if (run > longest) longest = run;
  }
  return longest;
}
