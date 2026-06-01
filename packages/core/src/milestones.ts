export type MilestoneKind =
  | "COMPLETED_7"
  | "COMPLETED_25"
  | "COMPLETED_50"
  | "STREAK_7"
  | "STREAK_30";

export interface MilestoneInput {
  completedCount: number;
  currentStreak: number;
}

const COMPLETION_RULES: ReadonlyArray<readonly [number, MilestoneKind]> = [
  [7, "COMPLETED_7"],
  [25, "COMPLETED_25"],
  [50, "COMPLETED_50"],
];

const STREAK_RULES: ReadonlyArray<readonly [number, MilestoneKind]> = [
  [7, "STREAK_7"],
  [30, "STREAK_30"],
];

/** Returns every milestone kind earned at the given totals, in a stable order. */
export function evaluateMilestones(input: MilestoneInput): MilestoneKind[] {
  const earned: MilestoneKind[] = [];
  for (const [threshold, kind] of COMPLETION_RULES) {
    if (input.completedCount >= threshold) earned.push(kind);
  }
  for (const [threshold, kind] of STREAK_RULES) {
    if (input.currentStreak >= threshold) earned.push(kind);
  }
  return earned;
}
