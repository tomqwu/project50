import { addDays, type DayKey } from "./dates";
import type { GoalType } from "./completion";

export type ValidationError =
  | "DAY_IN_FUTURE"
  | "DAY_BEFORE_START"
  | "DAY_AFTER_END"
  | "AMOUNT_NEGATIVE"
  | "MOOD_OUT_OF_RANGE";

export interface ChallengeWindow {
  goalType: GoalType;
  startDate: DayKey;
  lengthDays: number;
}

export interface ActivityInput {
  dayKey: DayKey;
  amount?: number;
  done?: boolean;
  mood?: number;
}

/** Pure validation of an activity against its challenge window, as of `asOf` (a day key). */
export function validateActivityInput(
  challenge: ChallengeWindow,
  input: ActivityInput,
  asOf: DayKey,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const lastDay = addDays(challenge.startDate, challenge.lengthDays - 1);

  if (input.dayKey > asOf) errors.push("DAY_IN_FUTURE");
  if (input.dayKey < challenge.startDate) errors.push("DAY_BEFORE_START");
  if (input.dayKey > lastDay) errors.push("DAY_AFTER_END");
  if (input.amount !== undefined && input.amount < 0) errors.push("AMOUNT_NEGATIVE");
  if (input.mood !== undefined && (input.mood < 1 || input.mood > 5)) errors.push("MOOD_OUT_OF_RANGE");

  return errors;
}
