# Project 50 Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed 50-day Project 50 program (7 daily rules, all-or-nothing, hard reset to Day 1 on a miss) as the hero plan, alongside the existing generic builder offered as a "custom plan."

**Architecture:** Approach C — a Project 50 *run* is a `Challenge` row with `kind=PROJECT50`; a new `RuleCheck` table stores the 7 daily rule completions; `DayStatus.completed` flips at 7/7; the hard reset is evaluated lazily (timezone-correct) on dashboard load. The 7 rules live as a code constant in `@project50/core`.

**Tech Stack:** Prisma (Postgres), Next.js 15 App Router, `@project50/core` (TS), vitest with a real test DB (`@/test/db`), `@project50/ui` components.

---

## File Structure

- `packages/core/src/project50.ts` — **create**: `PROJECT50_RULES`, `PROJECT50_LENGTH_DAYS`.
- `packages/core/src/index.ts` — **modify**: export the above.
- `packages/db/prisma/schema.prisma` — **modify**: `ChallengeKind`/`ChallengeStatus` enums, `Challenge.kind`/`.status`, `RuleCheck` model.
- `apps/web/test/db.ts` — **modify**: add `RuleCheck` to the truncate list.
- `apps/web/lib/project50.ts` — **create**: `getProject50State`, `startProject50`, `toggleRule`.
- `apps/web/app/(app)/_components/Project50View.tsx` — **create**: start / checklist / reset UI.
- `apps/web/app/(app)/page.tsx` — **modify**: render Project 50 state when present.
- `apps/web/app/(app)/_components/StartChoice.tsx` — **create**: "Start Project 50" vs "Custom plan".
- Tests colocated as `*.test.ts(x)`.

---

## Task 1: Core rules constant

**Files:**
- Create: `packages/core/src/project50.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/project50.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { PROJECT50_RULES, PROJECT50_LENGTH_DAYS } from "./project50";

describe("PROJECT50_RULES", () => {
  it("has exactly 7 rules with ids 1..7 and non-empty titles", () => {
    expect(PROJECT50_RULES).toHaveLength(7);
    expect(PROJECT50_RULES.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const r of PROJECT50_RULES) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });
  it("fixes the program length at 50 days", () => {
    expect(PROJECT50_LENGTH_DAYS).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/core exec vitest run src/project50.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the constant**

Create `packages/core/src/project50.ts`:

```ts
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
```

- [ ] **Step 4: Export from the package index**

In `packages/core/src/index.ts`, add:

```ts
export {
  PROJECT50_RULES,
  PROJECT50_RULE_IDS,
  PROJECT50_LENGTH_DAYS,
  type Project50Rule,
} from "./project50";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @project50/core exec vitest run src/project50.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/project50.ts packages/core/src/project50.test.ts packages/core/src/index.ts
git commit -m "feat(core): PROJECT50_RULES constant (7 rules, 50 days)"
```

---

## Task 2: Schema — kind/status + RuleCheck

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/web/test/db.ts`

- [ ] **Step 1: Add enums + fields + model**

In `packages/db/prisma/schema.prisma`, add the enums (near the other enums) and edit `Challenge`, then add `RuleCheck`:

```prisma
enum ChallengeKind {
  STANDARD
  PROJECT50
}

enum ChallengeStatus {
  ACTIVE
  FAILED
  COMPLETED
}
```

Add to `model Challenge` (after `lengthDays`):

```prisma
  kind        ChallengeKind   @default(STANDARD)
  status      ChallengeStatus @default(ACTIVE)
  ruleChecks  RuleCheck[]
```

Add the new model:

```prisma
model RuleCheck {
  id          String    @id @default(cuid())
  challengeId String
  challenge   Challenge @relation(fields: [challengeId], references: [id], onDelete: Cascade)
  dayKey      String
  ruleId      Int
  done        Boolean   @default(true)
  createdAt   DateTime  @default(now())

  @@unique([challengeId, dayKey, ruleId])
  @@index([challengeId, dayKey])
}
```

- [ ] **Step 2: Create + apply the migration**

Run: `pnpm --filter @project50/db migrate:dev --name project50_rules`
Expected: a new migration under `packages/db/prisma/migrations/`, Prisma Client regenerated, no errors. (This applies to the local Postgres, which is also the test DB.)

- [ ] **Step 3: Add RuleCheck to the test truncate list**

In `apps/web/test/db.ts`, add `"RuleCheck"` to the `TRUNCATE TABLE` statement (so integration tests reset it). It must be truncated alongside the others:

```ts
`TRUNCATE TABLE "User","Identity","Follow","Challenge","Activity","ActivityMedia","DayStatus","Reaction","Milestone","Recap","RuleCheck" RESTART IDENTITY CASCADE;`
```

- [ ] **Step 4: Verify the client has the new model + existing tests still pass**

Run: `pnpm --filter @project50/web test -- lib/api/challenges.integration.test.ts`
Expected: PASS (existing challenge tests unaffected by the new defaulted columns).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/web/test/db.ts
git commit -m "feat(db): Challenge.kind/status + RuleCheck model"
```

---

## Task 3a: Backend — startProject50 + getProject50State (NONE/ACTIVE)

**Files:**
- Create: `apps/web/lib/project50.ts`
- Test: `apps/web/lib/project50.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "@/test/db";
import { startProject50, getProject50State } from "./project50";

beforeEach(resetDb);
afterAll(async () => { await prisma.$disconnect(); });

async function makeUser() {
  return prisma.user.create({ data: { handle: "u", displayName: "U" } });
}
const NOW = new Date("2026-06-02T12:00:00Z");

describe("getProject50State", () => {
  it("returns NONE when the user has no Project 50 run", async () => {
    const u = await makeUser();
    expect((await getProject50State(u.id, NOW)).status).toBe("NONE");
  });

  it("startProject50 creates an ACTIVE run starting today; state is ACTIVE Day 1 with 0/7", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    const state = await getProject50State(u.id, NOW);
    expect(state.status).toBe("ACTIVE");
    expect(state.today?.dayNumber).toBe(1);
    expect(state.today?.completedCount).toBe(0);
    expect(state.today?.checks).toEqual([false, false, false, false, false, false, false]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/web exec vitest run lib/project50.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement startProject50 + getProject50State (NONE/ACTIVE branch)**

Create `apps/web/lib/project50.ts`:

```ts
import { prisma } from "@project50/db";
import { localDayKey, dayNumber, addDays, PROJECT50_RULE_IDS } from "@project50/core";

export interface Project50Today {
  dayKey: string;
  dayNumber: number;
  checks: boolean[]; // length 7, index = ruleId - 1
  completedCount: number;
}

export interface Project50State {
  status: "NONE" | "ACTIVE" | "FAILED";
  runId?: string;
  today?: Project50Today;
  failedDayNumber?: number;
  failedRuleId?: number;
}

/** The active Project 50 run for a user, or null. */
async function activeRun(uid: string) {
  return prisma.challenge.findFirst({
    where: { ownerId: uid, kind: "PROJECT50", status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

/** Create a new Project 50 run starting today (in `timezone`). Returns the run id. */
export async function startProject50(
  uid: string,
  timezone: string,
  now: Date = new Date(),
): Promise<string> {
  const startDate = localDayKey(now, timezone);
  const run = await prisma.challenge.create({
    data: {
      ownerId: uid,
      title: "Project 50",
      goalType: "BINARY",
      startDate,
      timezone,
      lengthDays: 50,
      kind: "PROJECT50",
      status: "ACTIVE",
    },
  });
  return run.id;
}

/** Build today's checklist for a run. */
async function buildToday(runId: string, startDate: string, todayKey: string): Promise<Project50Today> {
  const checksRows = await prisma.ruleCheck.findMany({
    where: { challengeId: runId, dayKey: todayKey, done: true },
  });
  const doneIds = new Set(checksRows.map((c) => c.ruleId));
  const checks = PROJECT50_RULE_IDS.map((id) => doneIds.has(id));
  return {
    dayKey: todayKey,
    dayNumber: Math.max(1, dayNumber(startDate, todayKey)),
    checks,
    completedCount: checks.filter(Boolean).length,
  };
}

export async function getProject50State(uid: string, now: Date = new Date()): Promise<Project50State> {
  const run = await activeRun(uid);
  if (!run) return { status: "NONE" };

  const todayKey = localDayKey(now, run.timezone);
  // (hard-reset evaluation added in Task 3c)
  return {
    status: "ACTIVE",
    runId: run.id,
    today: await buildToday(run.id, run.startDate, todayKey),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project50/web exec vitest run lib/project50.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/project50.ts apps/web/lib/project50.test.ts
git commit -m "feat(web): project50 start + state (none/active)"
```

---

## Task 3b: Backend — toggleRule + DayStatus recompute

**Files:**
- Modify: `apps/web/lib/project50.ts`
- Test: `apps/web/lib/project50.test.ts` (extend)

- [ ] **Step 1: Write the failing test (append to the describe block)**

```ts
import { toggleRule } from "./project50";

describe("toggleRule", () => {
  it("checks a rule on today and reflects it in state; DayStatus.completed only at 7/7", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);

    for (let ruleId = 1; ruleId <= 6; ruleId++) {
      await toggleRule(u.id, ruleId, true, NOW);
    }
    let state = await getProject50State(u.id, NOW);
    expect(state.today?.completedCount).toBe(6);
    let ds = await prisma.dayStatus.findFirst({ where: { dayKey: "2026-06-02" } });
    expect(ds?.completed).toBe(false);

    await toggleRule(u.id, 7, true, NOW);
    state = await getProject50State(u.id, NOW);
    expect(state.today?.completedCount).toBe(7);
    ds = await prisma.dayStatus.findFirst({ where: { dayKey: "2026-06-02" } });
    expect(ds?.completed).toBe(true);
  });

  it("unchecking a rule drops completion below 7/7", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    for (let ruleId = 1; ruleId <= 7; ruleId++) await toggleRule(u.id, ruleId, true, NOW);
    await toggleRule(u.id, 3, false, NOW);
    const ds = await prisma.dayStatus.findFirst({ where: { dayKey: "2026-06-02" } });
    expect(ds?.completed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/web exec vitest run lib/project50.test.ts -t toggleRule`
Expected: FAIL — `toggleRule` not exported.

- [ ] **Step 3: Implement toggleRule**

Append to `apps/web/lib/project50.ts`:

```ts
/** Set a rule's done state for TODAY on the user's active run; recompute DayStatus. */
export async function toggleRule(
  uid: string,
  ruleId: number,
  done: boolean,
  now: Date = new Date(),
): Promise<void> {
  const run = await activeRun(uid);
  if (!run) throw new Error("No active Project 50 run");
  const todayKey = localDayKey(now, run.timezone);

  await prisma.ruleCheck.upsert({
    where: {
      challengeId_dayKey_ruleId: { challengeId: run.id, dayKey: todayKey, ruleId },
    },
    update: { done },
    create: { challengeId: run.id, dayKey: todayKey, ruleId, done },
  });

  const doneCount = await prisma.ruleCheck.count({
    where: { challengeId: run.id, dayKey: todayKey, done: true },
  });
  const completed = doneCount === PROJECT50_RULE_IDS.length;

  await prisma.dayStatus.upsert({
    where: { challengeId_dayKey: { challengeId: run.id, dayKey: todayKey } },
    update: { completed },
    create: { challengeId: run.id, dayKey: todayKey, completed },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project50/web exec vitest run lib/project50.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/project50.ts apps/web/lib/project50.test.ts
git commit -m "feat(web): project50 toggleRule + DayStatus recompute"
```

---

## Task 3c: Backend — hard-reset evaluation

**Files:**
- Modify: `apps/web/lib/project50.ts`
- Test: `apps/web/lib/project50.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
describe("hard reset", () => {
  const LATER = new Date("2026-06-04T12:00:00Z"); // Day 3 relative to 2026-06-02 start

  it("marks the run FAILED when a past day was not 7/7, reporting the missed day + rule", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW); // start Day 1 = 2026-06-02
    // Day 1: only complete rules 1..6 (miss rule 7) → past-day failure once time advances
    for (let ruleId = 1; ruleId <= 6; ruleId++) await toggleRule(u.id, ruleId, true, NOW);

    const state = await getProject50State(u.id, LATER);
    expect(state.status).toBe("FAILED");
    expect(state.failedDayNumber).toBe(1);
    expect(state.failedRuleId).toBe(7);

    const run = await prisma.challenge.findFirst({ where: { ownerId: u.id, kind: "PROJECT50" } });
    expect(run?.status).toBe("FAILED");
  });

  it("stays ACTIVE when every past day was 7/7 (today still incomplete is OK)", async () => {
    const u = await makeUser();
    await startProject50(u.id, "UTC", NOW);
    for (let ruleId = 1; ruleId <= 7; ruleId++) await toggleRule(u.id, ruleId, true, NOW); // Day 1 complete
    const NEXT = new Date("2026-06-03T12:00:00Z"); // Day 2, nothing done yet today
    const state = await getProject50State(u.id, NEXT);
    expect(state.status).toBe("ACTIVE");
    expect(state.today?.dayNumber).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/web exec vitest run lib/project50.test.ts -t "hard reset"`
Expected: FAIL — state is ACTIVE (no reset logic yet).

- [ ] **Step 3: Implement evaluateRun inside getProject50State**

Replace the `getProject50State` body's "(hard-reset evaluation added in Task 3c)" section so it checks past days before returning ACTIVE:

```ts
export async function getProject50State(uid: string, now: Date = new Date()): Promise<Project50State> {
  const run = await activeRun(uid);
  if (!run) return { status: "NONE" };

  const todayKey = localDayKey(now, run.timezone);

  // Hard reset: any elapsed past day (startDate .. yesterday) that is not 7/7 fails the run.
  const yesterdayKey = addDays(todayKey, -1);
  for (let d = run.startDate; d <= yesterdayKey; d = addDays(d, 1)) {
    const ds = await prisma.dayStatus.findUnique({
      where: { challengeId_dayKey: { challengeId: run.id, dayKey: d } },
    });
    if (!ds?.completed) {
      await prisma.challenge.update({ where: { id: run.id }, data: { status: "FAILED" } });
      const doneRows = await prisma.ruleCheck.findMany({
        where: { challengeId: run.id, dayKey: d, done: true },
      });
      const doneIds = new Set(doneRows.map((r) => r.ruleId));
      const failedRuleId = PROJECT50_RULE_IDS.find((id) => !doneIds.has(id));
      return {
        status: "FAILED",
        runId: run.id,
        failedDayNumber: Math.max(1, dayNumber(run.startDate, d)),
        failedRuleId,
      };
    }
  }

  return {
    status: "ACTIVE",
    runId: run.id,
    today: await buildToday(run.id, run.startDate, todayKey),
  };
}
```

Note: `d <= yesterdayKey` string comparison is valid because `YYYY-MM-DD` sorts lexically by date.

- [ ] **Step 4: Run test to verify it passes (whole file)**

Run: `pnpm --filter @project50/web exec vitest run lib/project50.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/project50.ts apps/web/lib/project50.test.ts
git commit -m "feat(web): project50 hard-reset evaluation"
```

---

## Task 4: Web UI — Project50View (start / checklist / reset)

**Files:**
- Create: `apps/web/app/(app)/_components/Project50View.tsx`
- Test: `apps/web/app/(app)/_components/Project50View.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Project50View } from "./Project50View";

describe("Project50View", () => {
  it("NONE: renders the start choice with both options", () => {
    render(<Project50View state={{ status: "NONE" }} onStart={vi.fn()} onToggle={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByRole("button", { name: /start project 50/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /custom plan/i })).toHaveAttribute("href", "/challenges/new");
  });

  it("ACTIVE: renders Day n/50, 7 rule rows, and toggles a rule", () => {
    const onToggle = vi.fn();
    render(
      <Project50View
        state={{ status: "ACTIVE", runId: "r1", today: { dayKey: "2026-06-02", dayNumber: 3, checks: [true,false,false,false,false,false,false], completedCount: 1 } }}
        onStart={vi.fn()} onToggle={onToggle} onRestart={vi.fn()}
      />,
    );
    expect(screen.getByText(/Day 3 \/ 50/)).toBeInTheDocument();
    expect(screen.getAllByTestId(/rule-row-/)).toHaveLength(7);
    fireEvent.click(screen.getByTestId("rule-row-2"));
    expect(onToggle).toHaveBeenCalledWith(2, true); // rule 2 was unchecked → toggles to true
  });

  it("FAILED: shows the missed day + rule and a restart button", () => {
    const onRestart = vi.fn();
    render(<Project50View state={{ status: "FAILED", failedDayNumber: 12, failedRuleId: 3 }} onStart={vi.fn()} onToggle={vi.fn()} onRestart={onRestart} />);
    expect(screen.getByText(/Day 12/)).toBeInTheDocument();
    expect(screen.getByText(/Exercise/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(onRestart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/web exec vitest run "app/(app)/_components/Project50View.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Project50View**

Create `apps/web/app/(app)/_components/Project50View.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Button, Card, Label } from "@project50/ui";
import { PROJECT50_RULES } from "@project50/core";
import type { Project50State } from "@/lib/project50";

interface Props {
  state: Project50State;
  onStart: () => void;
  onToggle: (ruleId: number, done: boolean) => void;
  onRestart: () => void;
}

export function Project50View({ state, onStart, onToggle, onRestart }: Props) {
  if (state.status === "NONE") {
    return (
      <div style={{ padding: "48px 32px", textAlign: "center" }}>
        <Label>Choose your plan</Label>
        <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "28px", margin: "12px 0" }}>
          Project 50
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "8px" }}>
          7 daily rules. 50 days. Miss one — back to Day 1.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 28px", textAlign: "left", maxWidth: 320, marginInline: "auto" }}>
          {PROJECT50_RULES.map((r) => (
            <li key={r.id} style={{ color: "var(--text)", padding: "6px 0", borderBottom: "1px solid var(--hairline)" }}>
              <strong>{r.title}</strong>{" "}
              <span style={{ color: "var(--muted)", fontSize: 13 }}>· {r.detail}</span>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Button variant="primary" onClick={onStart}>Start Project 50</Button>
          <Link href="/challenges/new" style={{ textDecoration: "none" }}>
            <Button variant="ghost">Create a custom plan</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === "FAILED") {
    const rule = PROJECT50_RULES.find((r) => r.id === state.failedRuleId);
    return (
      <div style={{ padding: "48px 32px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "26px" }}>
          Streak broken
        </h1>
        <p style={{ color: "var(--muted)", margin: "12px 0 28px" }}>
          You missed <strong>{rule?.title ?? "a rule"}</strong> on Day {state.failedDayNumber}. Project 50 is all-or-nothing — restart from Day 1?
        </p>
        <Button variant="primary" onClick={onRestart}>Start over</Button>
      </div>
    );
  }

  // ACTIVE
  const today = state.today!;
  return (
    <div style={{ padding: "32px" }}>
      <Label>Project 50</Label>
      <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "28px", margin: "8px 0 4px" }}>
        Day {today.dayNumber} / 50
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        {today.completedCount} / 7 today · miss one and you restart at Day 1
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PROJECT50_RULES.map((r) => {
          const done = today.checks[r.id - 1];
          return (
            <Card key={r.id}>
              <button
                type="button"
                data-testid={`rule-row-${r.id}`}
                onClick={() => onToggle(r.id, !done)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, width: "100%",
                  padding: "16px", background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left", color: "var(--text)",
                }}
              >
                <span aria-hidden style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  border: "2px solid var(--accent)",
                  background: done ? "var(--accent)" : "transparent",
                  color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700,
                }}>{done ? "✓" : ""}</span>
                <span>
                  <strong>{r.title}</strong>
                  <br />
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>{r.detail}</span>
                </span>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project50/web exec vitest run "app/(app)/_components/Project50View.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/_components/Project50View.tsx" "apps/web/app/(app)/_components/Project50View.test.tsx"
git commit -m "feat(web): Project50View (start/checklist/reset UI)"
```

---

## Task 5: Wire the dashboard + server actions

**Files:**
- Create: `apps/web/app/(app)/_actions/project50.ts` (server actions)
- Modify: `apps/web/app/(app)/page.tsx`
- Modify: `apps/web/app/(app)/page.test.tsx` (extend)

- [ ] **Step 1: Write the failing test (dashboard renders Project 50 start when no run)**

Append to `apps/web/app/(app)/page.test.tsx` a case that mocks `getProject50State` to return `{ status: "NONE" }` and asserts the page renders the "Start Project 50" button. Match the file's existing mock style for `@/lib/session` and `@/lib/api/challenges`; add:

```ts
vi.mock("@/lib/project50", () => ({
  getProject50State: vi.fn().mockResolvedValue({ status: "NONE" }),
}));
```

and a test:

```ts
it("renders the Project 50 start choice when there is no active run", async () => {
  vi.mocked(requireUser).mockResolvedValue("u1");
  const ui = await DashboardPage();
  render(ui);
  expect(screen.getByRole("button", { name: /start project 50/i })).toBeInTheDocument();
});
```

(Import `DashboardPage` and `requireUser` as the existing tests in that file do.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project50/web exec vitest run "app/(app)/page.test.tsx" -t "Project 50 start"`
Expected: FAIL — page does not render Project 50 yet.

- [ ] **Step 3: Implement the server actions**

Create `apps/web/app/(app)/_actions/project50.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { startProject50, toggleRule } from "@/lib/project50";

export async function startProject50Action(timezone: string) {
  const uid = await requireUser();
  await startProject50(uid, timezone);
  revalidatePath("/");
}

export async function toggleRuleAction(ruleId: number, done: boolean) {
  const uid = await requireUser();
  await toggleRule(uid, ruleId, done);
  revalidatePath("/");
}
```

- [ ] **Step 4: Wire the dashboard page**

In `apps/web/app/(app)/page.tsx`, render `Project50View` from the Project 50 state, falling back to the existing `DashboardView` only when there is no Project 50 involvement. Replace the top of `DashboardPage` so it first checks Project 50 state:

```tsx
import { requireUser } from "@/lib/session";
import { getProject50State } from "@/lib/project50";
import { Project50Client } from "./_components/Project50Client";
// ...existing imports (listChallenges, DashboardView, etc.)

export default async function DashboardPage() {
  const uid = await requireUser();

  const p50 = await getProject50State(uid);
  if (p50.status !== "NONE") {
    return <Project50Client state={p50} />;
  }

  // No Project 50 run yet → show the start choice (still lets users pick custom).
  return <Project50Client state={p50} />;
}
```

(Existing STANDARD-challenge rendering via `DashboardView` is reachable through the custom-plan path `/challenges/new` and the challenge's own pages; the home dashboard now leads with Project 50.)

- [ ] **Step 5: Create the client wrapper that binds actions**

Create `apps/web/app/(app)/_components/Project50Client.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Project50View } from "./Project50View";
import type { Project50State } from "@/lib/project50";
import { startProject50Action, toggleRuleAction } from "../_actions/project50";

export function Project50Client({ state }: { state: Project50State }) {
  const [, startTransition] = useTransition();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Project50View
      state={state}
      onStart={() => startTransition(() => void startProject50Action(tz))}
      onRestart={() => startTransition(() => void startProject50Action(tz))}
      onToggle={(ruleId, done) => startTransition(() => void toggleRuleAction(ruleId, done))}
    />
  );
}
```

- [ ] **Step 6: Run the dashboard test + full web suite**

Run: `pnpm --filter @project50/web test`
Expected: PASS, coverage held. (If `page.test.tsx`'s existing populated-dashboard cases now conflict with the Project 50 lead, update them to mock `getProject50State` → `{ status: "NONE" }` so they still exercise `DashboardView` via the challenge path, or assert the Project 50 start screen as appropriate.)

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm --filter @project50/web run typecheck
git add "apps/web/app/(app)/page.tsx" "apps/web/app/(app)/page.test.tsx" "apps/web/app/(app)/_actions/project50.ts" "apps/web/app/(app)/_components/Project50Client.tsx"
git commit -m "feat(web): lead dashboard with Project 50 + server actions"
```

---

## Final verification

- [ ] **Run all suites + typechecks:**

```bash
pnpm --filter @project50/core test
pnpm --filter @project50/web test && pnpm --filter @project50/web run typecheck
```
Expected: all green, coverage held.

- [ ] **Manual check** (dev server already running on :3000): sign in, confirm the home page shows the **Start Project 50 / custom plan** choice; start Project 50 → 7-rule checklist with Day 1/50; toggle rules; confirm `n/7` updates and 7/7 marks the day complete.

---

## Self-Review

- **Spec coverage:** rules constant (T1), schema kind/status + RuleCheck (T2), start+state (T3a), toggle+DayStatus (T3b), hard reset (T3c), start/checklist/reset UI + custom-plan link (T4), dashboard wiring + actions (T5). Custom-plan path = the kept `/challenges/new` link in T4. Mobile/social are explicitly out of scope (SP2).
- **Placeholder scan:** none — every code step has complete code; the only conditional is T5 Step 6's note about updating pre-existing `page.test.tsx` cases, which is concrete (mock `getProject50State`).
- **Type consistency:** `Project50State` / `Project50Today` (`status`, `runId`, `today`, `failedDayNumber`, `failedRuleId`, `checks`, `completedCount`, `dayNumber`), `startProject50(uid, timezone, now?)`, `toggleRule(uid, ruleId, done, now?)`, `getProject50State(uid, now?)`, `PROJECT50_RULES`/`PROJECT50_RULE_IDS`/`PROJECT50_LENGTH_DAYS` — consistent across core, lib, UI, and actions.
