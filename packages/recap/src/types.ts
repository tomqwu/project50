export type RecapKind = "DAY" | "WEEK" | "FIFTY";

/** All valid recap kinds, useful for validation and iteration. */
export const RECAP_KINDS: readonly RecapKind[] = ["DAY", "WEEK", "FIFTY"];

export interface RecapData {
  title: string;
  kind: RecapKind;
  dayNumber: number;
  lengthDays: number;
  stats: {
    daysCompleted: number;
    totalAmount: number;
    unit?: string;
    currentStreak: number;
  };
  days: {
    dayKey: string;
    completed: boolean;
    amount?: number;
    photoUrl?: string;
  }[];
}
