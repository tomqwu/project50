# Project 50 Program — Fixed 50-Day Challenge

**Date:** 2026-06-02
**Status:** Approved design (Approach C, web-first)
**Adds:** a fixed Project 50 program as the hero plan, alongside the existing
generic builder (now offered as the "custom plan" option)

## Problem

The app is named **project50** but its "New Challenge" screen is a generic
single-metric habit builder (`title` + `goalType` + one `dailyTarget` + `unit`).
That has nothing to do with what Project 50 actually is: a fixed 50-day program
of **7 daily rules**, all-or-nothing, that **resets to Day 1** if you miss a day.

## Product decisions (locked)

1. **Two plan types.** A **fixed Project 50** program (the hero, opinionated) AND a
   **custom plan** option that keeps the existing generic single-metric builder.
   The Start screen lets the user choose between them. Project 50 mechanics
   (7 rules, all-or-nothing, hard reset) apply ONLY to the fixed plan; custom plans
   keep their current behavior (single metric, no hard reset).
2. **7 fixed rules** (hardcoded content):
   | # | Rule | Daily requirement |
   |---|------|-------------------|
   | 1 | Wake up before 8 AM | + 6h sleep, consistent schedule |
   | 2 | Morning routine | 1 hour, no phone/distraction |
   | 3 | Exercise | 1 hour, any activity |
   | 4 | Read | 10 pages of nonfiction |
   | 5 | Learn a skill | 1 hour |
   | 6 | Drink water / eat clean | stay hydrated, healthy diet |
   | 7 | Track progress | journal the day (wins + lessons) |
3. **A day "counts" only when all 7 rules are checked.**
4. **Hard reset (75 Hard style):** miss any rule on any *elapsed* day → the run
   fails and restarts at Day 1.

## Approach C — reuse `Challenge` as the run + one `RuleCheck` table

### Rules as code, not data

`@project50/core` exports a single source of truth, shared web + mobile:

```ts
export const PROJECT50_LENGTH_DAYS = 50;
export const PROJECT50_RULES = [
  { id: 1, title: "Wake up before 8 AM", detail: "+ 6h sleep, consistent schedule" },
  { id: 2, title: "Morning routine", detail: "1 hour, no phone/distraction" },
  { id: 3, title: "Exercise", detail: "1 hour, any activity" },
  { id: 4, title: "Read", detail: "10 pages of nonfiction" },
  { id: 5, title: "Learn a skill", detail: "1 hour" },
  { id: 6, title: "Drink water / eat clean", detail: "stay hydrated, healthy diet" },
  { id: 7, title: "Track progress", detail: "journal the day (wins + lessons)" },
] as const;
export type Project50RuleId = (typeof PROJECT50_RULES)[number]["id"];
```

### Schema (Prisma — one new table + two fields)

```prisma
enum ChallengeKind { STANDARD PROJECT50 }
enum ChallengeStatus { ACTIVE FAILED COMPLETED }

model Challenge {
  // ...existing fields...
  kind        ChallengeKind   @default(STANDARD)
  status      ChallengeStatus @default(ACTIVE)
  ruleChecks  RuleCheck[]
}

model RuleCheck {
  id          String   @id @default(cuid())
  challengeId String
  challenge   Challenge @relation(fields: [challengeId], references: [id], onDelete: Cascade)
  dayKey      String   // local day, e.g. "2026-06-02"
  ruleId      Int      // 1..7
  done        Boolean  @default(true)
  createdAt   DateTime @default(now())
  @@unique([challengeId, dayKey, ruleId])
}
```

- A **run** is a `Challenge` row with `kind=PROJECT50`, `startDate` = Day 1.
- Defaults (`STANDARD`/`ACTIVE`) keep all existing rows and tests unaffected.

### Backend — `apps/web/lib/project50.ts`

```
getActiveRun(uid): Promise<Challenge | null>     // kind=PROJECT50, status=ACTIVE
startProject50(uid, timezone): Promise<Challenge> // create run, startDate = today (tz)
toggleRule(uid, ruleId, done): Promise<DayStatus> // upsert RuleCheck for TODAY, recompute DayStatus.completed
evaluateRun(run, now): { status, failedDay?, failedRuleId? } // lazy hard-reset check
```

- **`dayNumber`** = days between `startDate` and today (run tz) + 1, clamped ≥ 1.
- **`toggleRule`** only mutates **today's** checks; recomputes `DayStatus.completed`
  = (count of done RuleChecks for today === 7).
- **`evaluateRun` (hard reset):** for each day `d` from `startDate` to *yesterday*,
  if `d` is not 7/7 → set run `status=FAILED`, return the first `failedDay`/`failedRuleId`.
  **Today is never failed** (user can still finish it). Called on dashboard load and
  before `toggleRule`. No cron — purely lazy, timezone-correct.
- **Restart:** `startProject50` after a FAILED run creates a fresh ACTIVE run today.

### Web UI (fixed plan + custom option)

**Start screen** (shown when there is no active Project 50 run AND from "New"):
a choice between two paths —
- **"Start Project 50"** (hero): explains the 7 rules + the reset stakes →
  `startProject50` → the daily checklist.
- **"Create a custom plan"**: links to the existing generic builder
  (`/challenges/new`), unchanged.

**Dashboard (`/`)** renders based on the active Project 50 run + `evaluateRun`:
- **Active Project 50 run** → *Daily checklist*: `Day X / 50`, the 7 rules as large
  toggle rows (tap → `toggleRule`), today's `n / 7`, and a visible "miss any rule →
  back to Day 1" warning.
- **Just failed** (evaluateRun → FAILED) → *Reset screen*: "You missed **{rule}** on
  Day {n} — restart from Day 1?" → **"Start over"** → `startProject50`.
- **No Project 50 run** → the Start screen (above). Existing STANDARD challenges still
  render via the current `DashboardView` single-metric layout.

Uses existing `@project50/ui` (`Card`, `Button`, `Label`, etc.) inside the app-shell
column. The generic `/challenges/new` builder is **kept** as the custom-plan path.

### Reuse preserved

Feed / recap / publishing keep working off `Challenge`/`Activity`. The rule-7 journal
MAY write an `Activity` so progress shows in the feed — **optional, deferred to SP2**.

## Testing (hold coverage bar)

- `core`: `PROJECT50_RULES` shape (7 rules, ids 1–7), `PROJECT50_LENGTH_DAYS`.
- `project50.ts` (integration, test DB): start creates ACTIVE run with today startDate;
  toggleRule upserts + sets `DayStatus.completed` only at 7/7; dayNumber math;
  evaluateRun marks FAILED when a past day < 7/7, stays ACTIVE when all past days 7/7,
  never fails today; restart after FAILED.
- Web UI: start state renders rules + button; checklist toggles a rule; reset screen
  shows the missed rule/day.

## Out of scope (SP2 / later)

- Mobile parity (the mobile app still shows its current screens).
- Feed/recap copy tuned for Project 50; journaling photos.
- Editing the **fixed** Project 50 rule set or its 50-day length (custom *plans* use
  the existing generic builder instead), multiple concurrent Project 50 runs.
- Notifications/reminders for the 8 AM / daily deadlines.

## Risks

- **Timezone correctness** of `dayNumber` and the hard-reset boundary — must use the
  run's stored `timezone` consistently (reuse the existing `localDayKey`/`dayNumber`
  helpers from `@project50/core`).
- **Migration**: adding enums + `RuleCheck` requires a Prisma migration; existing
  challenge factories/tests must still pass on the new defaults.
