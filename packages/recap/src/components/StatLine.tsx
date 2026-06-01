import React from "react";
import { colors, fonts } from "../tokens.js";

export interface StatLineProps {
  daysCompleted: number;
  totalAmount: number;
  unit?: string;
  currentStreak: number;
}

/**
 * One-line stat summary: "{daysCompleted} days · {totalAmount} {unit} · {streak} streak".
 * Static display — no animation (it composes inside animated containers).
 */
export function StatLine({
  daysCompleted,
  totalAmount,
  unit,
  currentStreak,
}: StatLineProps) {
  const parts: string[] = [
    `${daysCompleted} day${daysCompleted !== 1 ? "s" : ""}`,
  ];
  if (totalAmount > 0) {
    parts.push(`${totalAmount}${unit ? " " + unit : ""}`);
  }
  parts.push(`${currentStreak} streak`);

  return (
    <div
      data-testid="stat-line"
      style={{
        fontFamily: fonts.body,
        fontSize: 16,
        fontWeight: 500,
        color: colors.muted,
        letterSpacing: "0.04em",
      }}
    >
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (
            <span
              style={{ color: colors.volt, marginInline: 8 }}
              aria-hidden="true"
            >
              ·
            </span>
          )}
          <span data-testid={`stat-part-${i}`}>{part}</span>
        </span>
      ))}
    </div>
  );
}
