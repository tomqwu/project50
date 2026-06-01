export interface CardModelInput {
  title: string;
  daysCompleted: number;
  totalAmount?: number | null;
  unit?: string | null;
  dayNumber: number;
  lengthDays: number;
}

export interface CardModel {
  headline: string;
  subline: string;
  statText: string;
}

/**
 * Builds the pure view-model for the milestone image card.
 *
 * headline:
 *   - when daysCompleted / dayNumber >= lengthDays → "Day {lengthDays} complete"
 *   - otherwise → "Day {dayNumber} of {lengthDays}"
 *
 * subline: the challenge title
 *
 * statText: "{daysCompleted} days" + " · {totalAmount} {unit}" when both present
 */
export function buildCardModel({
  title,
  daysCompleted,
  totalAmount,
  unit,
  dayNumber,
  lengthDays,
}: CardModelInput): CardModel {
  const isComplete = dayNumber >= lengthDays;

  const headline = isComplete
    ? `Day ${lengthDays} complete`
    : `Day ${dayNumber} of ${lengthDays}`;

  const subline = title;

  const hasTotal = totalAmount !== null && totalAmount !== undefined;
  const hasUnit = unit !== null && unit !== undefined && unit !== "";

  const statText =
    hasTotal && hasUnit
      ? `${daysCompleted} days · ${totalAmount} ${unit}`
      : `${daysCompleted} days`;

  return { headline, subline, statText };
}
