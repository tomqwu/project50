export type GoalType = "TARGET" | "BINARY";

export interface CompletionRule {
  goalType: GoalType;
  /** Required when goalType is TARGET. */
  dailyTarget?: number;
}

export interface DayActivity {
  amount?: number;
  done?: boolean;
}

export interface DayCompletion {
  totalAmount: number;
  completed: boolean;
}

/** Pure per-day completion: sums TARGET amounts vs the daily target, or any-done for BINARY. */
export function computeDayCompletion(rule: CompletionRule, activities: DayActivity[]): DayCompletion {
  if (rule.goalType === "BINARY") {
    return { totalAmount: 0, completed: activities.some((a) => a.done === true) };
  }
  const totalAmount = activities.reduce((sum, a) => sum + (a.amount ?? 0), 0);
  const target = rule.dailyTarget ?? 0;
  return { totalAmount, completed: totalAmount >= target && target > 0 };
}
