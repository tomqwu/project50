export const PROJECT50_LENGTH_DAYS = 50;

export interface Project50Rule {
  id: number; // 1..7
  title: string;
  detail: string;
}

export const PROJECT50_RULES: readonly Project50Rule[] = [
  { id: 1, title: "Wake up before 8 AM", detail: "+ 6h sleep, consistent schedule" },
  { id: 2, title: "Morning routine", detail: "1 hour, no phone/distraction" },
  { id: 3, title: "Exercise", detail: "1 hour, any activity" },
  { id: 4, title: "Read", detail: "10 pages of nonfiction" },
  { id: 5, title: "Learn a skill", detail: "1 hour" },
  { id: 6, title: "Drink water / eat clean", detail: "stay hydrated, healthy diet" },
  { id: 7, title: "Track progress", detail: "journal the day (wins + lessons)" },
] as const;

export const PROJECT50_RULE_IDS: readonly number[] = PROJECT50_RULES.map((r) => r.id);
