# project50 Phase 1 — Core Domain + Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the full Prisma data model and the pure, framework-free domain logic (timezone-aware day keys, day completion, streaks, milestones, validation) in `packages/core`, exhaustively unit-tested to the hard 99% gate.

**Architecture:** `packages/core` stays pure — plain TS types + deterministic functions, no Prisma/HTTP/Date.now (callers pass `now`/`asOf`). The Prisma schema in `packages/db` mirrors these concepts for persistence but is wired to core only later (Phase 2 API). Each core concern is its own small file with co-located tests.

**Tech Stack:** TypeScript, Vitest (99% gate), Prisma 5 + PostgreSQL. Builds on Phase 0.

---

## File Structure

```
packages/db/prisma/schema.prisma         (extended: full domain models + migration)
packages/core/src/types.ts               domain types (compile to no runtime; verified via usage)
packages/core/src/dates.ts               localDayKey, dayNumber, addDays  (+ dates.test.ts)
packages/core/src/completion.ts          computeDayCompletion            (+ completion.test.ts)
packages/core/src/streak.ts              currentStreak, longestStreak    (+ streak.test.ts)
packages/core/src/milestones.ts          evaluateMilestones              (+ milestones.test.ts)
packages/core/src/validation.ts          validateActivityInput           (+ validation.test.ts)
packages/core/src/index.ts               barrel (extended)               (+ index.test.ts updated)
```

Conventions: a "day key" is a `YYYY-MM-DD` string in the challenge's timezone. Functions are
pure and deterministic — callers pass the reference instant/day; no `Date.now()` is used.

---

### Task 1: Extend the Prisma schema with the full domain model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: a new migration under `packages/db/prisma/migrations/`

- [ ] **Step 1: Replace the sentinel with the domain models**

Set `packages/db/prisma/schema.prisma` to:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Provider {
  GOOGLE
  FACEBOOK
}

enum GoalType {
  TARGET
  BINARY
}

enum Visibility {
  PUBLIC
  FOLLOWERS
  PRIVATE
}

enum ReactionKind {
  CHEER
  COMMENT
}

enum MilestoneKind {
  COMPLETED_7
  COMPLETED_25
  COMPLETED_50
  STREAK_7
  STREAK_30
}

model User {
  id          String     @id @default(cuid())
  handle      String     @unique
  displayName String
  avatarUrl   String?
  createdAt   DateTime   @default(now())
  identities  Identity[]
  challenges  Challenge[]
  activities  Activity[]
  reactions   Reaction[]
  following   Follow[]   @relation("follower")
  followers   Follow[]   @relation("followee")
}

model Identity {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider          Provider
  providerAccountId String
  createdAt         DateTime @default(now())

  @@unique([provider, providerAccountId])
}

model Follow {
  followerId String
  followeeId String
  follower   User     @relation("follower", fields: [followerId], references: [id], onDelete: Cascade)
  followee   User     @relation("followee", fields: [followeeId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())

  @@id([followerId, followeeId])
}

model Challenge {
  id          String      @id @default(cuid())
  ownerId     String
  owner       User        @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  title       String
  goalType    GoalType
  unit        String?
  dailyTarget Float?
  startDate   String      // YYYY-MM-DD in the challenge timezone
  timezone    String      @default("UTC")
  lengthDays  Int         @default(50)
  visibility  Visibility  @default(PUBLIC)
  shareId     String      @unique @default(cuid())
  createdAt   DateTime    @default(now())
  activities  Activity[]
  dayStatuses DayStatus[]
  milestones  Milestone[]
}

model Activity {
  id           String          @id @default(cuid())
  challengeId  String
  challenge    Challenge       @relation(fields: [challengeId], references: [id], onDelete: Cascade)
  userId       String
  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  dayKey       String          // YYYY-MM-DD
  activityType String?
  amount       Float?
  done         Boolean         @default(false)
  note         String?
  mood         Int?
  createdAt    DateTime        @default(now())
  media        ActivityMedia[]
  reactions    Reaction[]

  @@index([challengeId, dayKey])
}

model ActivityMedia {
  id         String   @id @default(cuid())
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  objectKey  String
  width      Int
  height     Int
  order      Int      @default(0)
}

model DayStatus {
  challengeId String
  challenge   Challenge @relation(fields: [challengeId], references: [id], onDelete: Cascade)
  dayKey      String
  totalAmount Float     @default(0)
  completed   Boolean   @default(false)

  @@id([challengeId, dayKey])
}

model Reaction {
  id         String       @id @default(cuid())
  activityId String
  activity   Activity     @relation(fields: [activityId], references: [id], onDelete: Cascade)
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind       ReactionKind
  text       String?
  createdAt  DateTime     @default(now())
}

model Milestone {
  id          String        @id @default(cuid())
  challengeId String
  challenge   Challenge     @relation(fields: [challengeId], references: [id], onDelete: Cascade)
  kind        MilestoneKind
  earnedAt    DateTime      @default(now())

  @@unique([challengeId, kind])
}
```

- [ ] **Step 2: Ensure dev DB is running and create the migration**

Run: `docker compose up -d postgres` (no-op if already up).
Run: `export $(grep -v '^#' .env | xargs) && pnpm --filter @project50/db exec prisma migrate dev --name domain_models`
Expected: a new migration dir created; client regenerates; no errors.

- [ ] **Step 3: Verify schema validity + format**

Run: `pnpm --filter @project50/db exec prisma validate`
Run: `pnpm --filter @project50/db exec prisma format`
Expected: "schema is valid". Re-stage if format changed whitespace.

- [ ] **Step 4: Commit**
```bash
git add packages/db/prisma
git commit -m "feat(db): full domain schema (users, challenges, activities, reactions, milestones)"
```

---

### Task 2: `dates.ts` — timezone-aware day keys (TDD)

**Files:**
- Test:   `packages/core/src/dates.test.ts`
- Create: `packages/core/src/dates.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/dates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { addDays, dayNumber, localDayKey } from "./dates";

describe("localDayKey", () => {
  it("formats an instant as YYYY-MM-DD in the given timezone", () => {
    // 2026-06-01T05:30:00Z is still 2026-06-01 in UTC and in Asia/Shanghai (+08 → 13:30)
    expect(localDayKey(new Date("2026-06-01T05:30:00Z"), "UTC")).toBe("2026-06-01");
    expect(localDayKey(new Date("2026-06-01T05:30:00Z"), "Asia/Shanghai")).toBe("2026-06-01");
  });

  it("rolls the day backward for a timezone behind UTC", () => {
    // 2026-06-01T02:00:00Z is 2026-05-31 21:00 in America/New_York (-05)
    expect(localDayKey(new Date("2026-06-01T02:00:00Z"), "America/New_York")).toBe("2026-05-31");
  });

  it("rolls the day forward for a timezone ahead of UTC", () => {
    // 2026-06-01T20:00:00Z is 2026-06-02 04:00 in Asia/Shanghai (+08)
    expect(localDayKey(new Date("2026-06-01T20:00:00Z"), "Asia/Shanghai")).toBe("2026-06-02");
  });
});

describe("addDays", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-01-01", 31)).toBe("2026-02-01");
  });
  it("subtracts with negative n", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dayNumber", () => {
  it("is 1-based from the start date", () => {
    expect(dayNumber("2026-06-01", "2026-06-01")).toBe(1);
    expect(dayNumber("2026-06-01", "2026-06-10")).toBe(10);
  });
  it("returns <=0 for days before the start", () => {
    expect(dayNumber("2026-06-01", "2026-05-31")).toBe(0);
  });
});
```

- [ ] **Step 2: Run → confirm FAIL** (`pnpm --filter @project50/core test`; module not found).

- [ ] **Step 3: Implement**

Create `packages/core/src/dates.ts`:
```ts
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
```

- [ ] **Step 4: Run → confirm PASS + 100% coverage on dates.ts.**

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/dates.ts packages/core/src/dates.test.ts
git commit -m "feat(core): timezone-aware day-key helpers"
```

---

### Task 3: `completion.ts` — per-day completion (TDD)

**Files:**
- Test:   `packages/core/src/completion.test.ts`
- Create: `packages/core/src/completion.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/completion.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { computeDayCompletion } from "./completion";

const target = { goalType: "TARGET" as const, dailyTarget: 60 };
const binary = { goalType: "BINARY" as const };

describe("computeDayCompletion (TARGET)", () => {
  it("sums amounts and completes when the target is met", () => {
    expect(computeDayCompletion(target, [{ amount: 25 }, { amount: 35 }])).toEqual({
      totalAmount: 60,
      completed: true,
    });
  });
  it("is incomplete below target", () => {
    expect(computeDayCompletion(target, [{ amount: 20 }])).toEqual({
      totalAmount: 20,
      completed: false,
    });
  });
  it("treats missing amounts as zero", () => {
    expect(computeDayCompletion(target, [{}, { amount: 10 }])).toEqual({
      totalAmount: 10,
      completed: false,
    });
  });
  it("is incomplete with no activities", () => {
    expect(computeDayCompletion(target, [])).toEqual({ totalAmount: 0, completed: false });
  });
});

describe("computeDayCompletion (BINARY)", () => {
  it("completes when any activity is done", () => {
    expect(computeDayCompletion(binary, [{ done: false }, { done: true }])).toEqual({
      totalAmount: 0,
      completed: true,
    });
  });
  it("is incomplete when none are done", () => {
    expect(computeDayCompletion(binary, [{ done: false }])).toEqual({
      totalAmount: 0,
      completed: false,
    });
  });
});
```

- [ ] **Step 2: Run → confirm FAIL.**

- [ ] **Step 3: Implement**

Create `packages/core/src/completion.ts`:
```ts
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
```

- [ ] **Step 4: Run → confirm PASS + 100% coverage.**

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/completion.ts packages/core/src/completion.test.ts
git commit -m "feat(core): per-day completion (target accumulation + binary)"
```

---

### Task 4: `streak.ts` — current & longest streak (TDD)

**Files:**
- Test:   `packages/core/src/streak.test.ts`
- Create: `packages/core/src/streak.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/streak.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { currentStreak, longestStreak } from "./streak";

describe("currentStreak", () => {
  it("counts consecutive completed days ending at asOf", () => {
    const done = ["2026-06-01", "2026-06-02", "2026-06-03"];
    expect(currentStreak(done, "2026-06-03")).toBe(3);
  });
  it("is 0 when asOf day is not completed", () => {
    expect(currentStreak(["2026-06-01", "2026-06-02"], "2026-06-03")).toBe(0);
  });
  it("stops at the first gap", () => {
    const done = ["2026-06-01", "2026-06-03", "2026-06-04"];
    expect(currentStreak(done, "2026-06-04")).toBe(2);
  });
  it("is 0 for an empty history", () => {
    expect(currentStreak([], "2026-06-04")).toBe(0);
  });
});

describe("longestStreak", () => {
  it("finds the longest consecutive run", () => {
    const done = ["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-05", "2026-06-06"];
    expect(longestStreak(done)).toBe(3);
  });
  it("is 0 for an empty history", () => {
    expect(longestStreak([])).toBe(0);
  });
  it("handles unsorted input with duplicates", () => {
    const done = ["2026-06-02", "2026-06-01", "2026-06-02"];
    expect(longestStreak(done)).toBe(2);
  });
});
```

- [ ] **Step 2: Run → confirm FAIL.**

- [ ] **Step 3: Implement**

Create `packages/core/src/streak.ts`:
```ts
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
```

- [ ] **Step 4: Run → confirm PASS + 100% coverage.**

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/streak.ts packages/core/src/streak.test.ts
git commit -m "feat(core): current and longest streak computation"
```

---

### Task 5: `milestones.ts` — badge rules (TDD)

**Files:**
- Test:   `packages/core/src/milestones.test.ts`
- Create: `packages/core/src/milestones.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/milestones.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { evaluateMilestones } from "./milestones";

describe("evaluateMilestones", () => {
  it("awards completion badges at thresholds", () => {
    expect(evaluateMilestones({ completedCount: 7, currentStreak: 1 })).toContain("COMPLETED_7");
    expect(evaluateMilestones({ completedCount: 25, currentStreak: 1 })).toEqual(
      expect.arrayContaining(["COMPLETED_7", "COMPLETED_25"]),
    );
    expect(evaluateMilestones({ completedCount: 50, currentStreak: 1 })).toEqual(
      expect.arrayContaining(["COMPLETED_7", "COMPLETED_25", "COMPLETED_50"]),
    );
  });

  it("awards streak badges at thresholds", () => {
    expect(evaluateMilestones({ completedCount: 7, currentStreak: 7 })).toContain("STREAK_7");
    expect(evaluateMilestones({ completedCount: 30, currentStreak: 30 })).toEqual(
      expect.arrayContaining(["STREAK_7", "STREAK_30"]),
    );
  });

  it("awards nothing below the first threshold", () => {
    expect(evaluateMilestones({ completedCount: 6, currentStreak: 6 })).toEqual([]);
  });

  it("returns kinds in a stable order", () => {
    expect(evaluateMilestones({ completedCount: 50, currentStreak: 30 })).toEqual([
      "COMPLETED_7",
      "COMPLETED_25",
      "COMPLETED_50",
      "STREAK_7",
      "STREAK_30",
    ]);
  });
});
```

- [ ] **Step 2: Run → confirm FAIL.**

- [ ] **Step 3: Implement**

Create `packages/core/src/milestones.ts`:
```ts
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
```

- [ ] **Step 4: Run → confirm PASS + 100% coverage.**

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/milestones.ts packages/core/src/milestones.test.ts
git commit -m "feat(core): milestone/badge evaluation rules"
```

---

### Task 6: `validation.ts` — activity input validation (TDD)

**Files:**
- Test:   `packages/core/src/validation.test.ts`
- Create: `packages/core/src/validation.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/validation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { validateActivityInput } from "./validation";

const challenge = {
  goalType: "TARGET" as const,
  startDate: "2026-06-01",
  lengthDays: 50,
};

const base = { dayKey: "2026-06-05", amount: 30, done: false, mood: 3 };

describe("validateActivityInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateActivityInput(challenge, base, "2026-06-10")).toEqual([]);
  });

  it("rejects a future day", () => {
    expect(validateActivityInput(challenge, { ...base, dayKey: "2026-06-11" }, "2026-06-10")).toContain(
      "DAY_IN_FUTURE",
    );
  });

  it("rejects a day before the challenge starts", () => {
    expect(validateActivityInput(challenge, { ...base, dayKey: "2026-05-31" }, "2026-06-10")).toContain(
      "DAY_BEFORE_START",
    );
  });

  it("rejects a day after the challenge window", () => {
    // start 2026-06-01 + 50 days → last day 2026-07-20
    expect(validateActivityInput(challenge, { ...base, dayKey: "2026-07-21" }, "2026-12-31")).toContain(
      "DAY_AFTER_END",
    );
  });

  it("rejects a negative amount", () => {
    expect(validateActivityInput(challenge, { ...base, amount: -1 }, "2026-06-10")).toContain(
      "AMOUNT_NEGATIVE",
    );
  });

  it("rejects an out-of-range mood", () => {
    expect(validateActivityInput(challenge, { ...base, mood: 6 }, "2026-06-10")).toContain("MOOD_OUT_OF_RANGE");
    expect(validateActivityInput(challenge, { ...base, mood: 0 }, "2026-06-10")).toContain("MOOD_OUT_OF_RANGE");
  });

  it("allows an omitted mood", () => {
    const { mood: _omit, ...noMood } = base;
    expect(validateActivityInput(challenge, noMood, "2026-06-10")).toEqual([]);
  });

  it("accumulates multiple errors", () => {
    const bad = { dayKey: "2026-05-31", amount: -5, done: false, mood: 9 };
    expect(validateActivityInput(challenge, bad, "2026-06-10").sort()).toEqual(
      ["AMOUNT_NEGATIVE", "DAY_BEFORE_START", "MOOD_OUT_OF_RANGE"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run → confirm FAIL.**

- [ ] **Step 3: Implement**

Create `packages/core/src/validation.ts`:
```ts
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
```
(Day keys are `YYYY-MM-DD`, so lexicographic string comparison equals chronological comparison.)

- [ ] **Step 4: Run → confirm PASS + 100% coverage.**

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/validation.ts packages/core/src/validation.test.ts
git commit -m "feat(core): activity input validation"
```

---

### Task 7: Barrel exports + full green run + PR

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/index.test.ts`

- [ ] **Step 1: Extend the barrel**

Set `packages/core/src/index.ts` to:
```ts
export { coreVersion } from "./version";
export { addDays, dayNumber, localDayKey, type DayKey } from "./dates";
export { computeDayCompletion, type CompletionRule, type DayActivity, type DayCompletion, type GoalType } from "./completion";
export { currentStreak, longestStreak } from "./streak";
export { evaluateMilestones, type MilestoneInput, type MilestoneKind } from "./milestones";
export { validateActivityInput, type ActivityInput, type ChallengeWindow, type ValidationError } from "./validation";
```

- [ ] **Step 2: Update the barrel test to cover the new re-exports**

Set `packages/core/src/index.test.ts` to:
```ts
import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("core public API", () => {
  it("re-exports every domain function", () => {
    expect(typeof core.coreVersion).toBe("function");
    expect(typeof core.localDayKey).toBe("function");
    expect(typeof core.addDays).toBe("function");
    expect(typeof core.dayNumber).toBe("function");
    expect(typeof core.computeDayCompletion).toBe("function");
    expect(typeof core.currentStreak).toBe("function");
    expect(typeof core.longestStreak).toBe("function");
    expect(typeof core.evaluateMilestones).toBe("function");
    expect(typeof core.validateActivityInput).toBe("function");
  });
});
```

- [ ] **Step 3: Full green run**

Run: `pnpm test` → core ≥99% (expect 100%) across all new modules; web unaffected.
Run: `pnpm typecheck` → 0 errors.
Run: `pnpm lint` → 0 errors/warnings.

- [ ] **Step 4: Commit**
```bash
git add packages/core/src/index.ts packages/core/src/index.test.ts
git commit -m "feat(core): export domain API from barrel"
```

- [ ] **Step 5: Push + open PR (auto-merge on green per workflow rule)**
```bash
git push -u origin feat/phase1-core-domain
gh pr create --base main --head feat/phase1-core-domain \
  --title "Phase 1: core domain logic + full schema" --fill
```
Then watch CI; when green, merge automatically (`gh pr merge <n> --merge --delete-branch`) and sync main. (CI runs `prisma migrate deploy`, which applies the new domain migration against the CI Postgres — confirm that step passes.)

---

## Self-Review (completed)

- **Spec coverage:** Implements the domain model (§4 of the spec: User/Identity/Follow/Challenge/Activity/ActivityMedia/DayStatus/Reaction/Milestone) and the core rules behind flows §5 and error-handling §6 (completion, streaks, milestones, validation). Auth/API/UI/sharing remain in later phases.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `GoalType` is defined once in `completion.ts` and re-used by `validation.ts` and the barrel; `DayKey` defined in `dates.ts` and imported by `streak.ts`/`validation.ts`; `MilestoneKind` (core string union) intentionally mirrors the Prisma `MilestoneKind` enum names. Function names match between tasks and the barrel.
- **Purity:** no `Date.now()`; all reference points (`asOf`) are parameters — deterministic and fully testable, satisfying the spec's timezone note.
