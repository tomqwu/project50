# Engagement & Social Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Merge gate (every code task):** unit tests → e2e → `/codex:review` (fix blockers before commit) → CI green. TDD + 99% coverage (web) is the existing bar. Additive Prisma migrations only.

**Goal:** Add four engagement features to Project 50: (1) a **daily journal** (wins + lessons) on each day, (2) **per-day sharing** of a completed day, (3) a **leaderboard** (friends + global) to replace the flat dashboard, and (4) a one-tap **"invite friends on Facebook"** action that shares the app via the user's referral link.

**Architecture:** Web is the reference implementation. Reuse existing infra: `Follow` (= friends), `Referral` + `User.referralCode` (= invites), `Challenge.shareId` + `/c/[shareId]` (= public sharing), the `next/og` ImageResponse routes (= share cards), and the FB Share Dialog pattern already used in `SocialShare` (`https://www.facebook.com/sharer/sharer.php?u=…`). One new model (`DayJournal`); everything else is lib + API + UI.

**Tech Stack:** Next.js 15 App Router (server actions + RSC), Prisma/Postgres, `@project50/core` (date helpers `localDayKey`/`dayNumber`/`PROJECT50_*`), `next/og`, vitest + RNTL.

> **Scope note:** these are four independently-shippable features in one "engagement" epic. They can each be a separate PR (recommended). Order: **F1 Journal → F2 Per-day share → F3 Leaderboard → F4 FB invite** (F2 reuses F1's journal in the day card; F4 reuses the referral link).

> **⚠️ Facebook reality check (F4):** Facebook does **not** allow reading a user's friend list for non-game apps (`user_friends` only returns friends who already use *your* app and requires App Review; App Invites/Game Requests are gaming-only). So "share to your FB friends" is implemented as the **Share Dialog** (post the referral link to the user's feed / pick recipients in FB's own UI) — we never enumerate their friends. This is the only compliant approach and matches the existing `sharer.php` pattern.

---

## File structure

| File | Responsibility |
|------|----------------|
| `packages/db/prisma/schema.prisma` | + `DayJournal` model (F1) |
| `apps/web/lib/journal.ts` | F1: get/upsert a day's journal for a run |
| `apps/web/app/(app)/_actions/journal.ts` | F1: `saveJournalAction` server action |
| `apps/web/app/(app)/_components/DayJournalSection.tsx` | F1: journal editor in the Project 50 check-in |
| `apps/web/lib/api/day-share.ts` | F2: load a single public day (rules + photo + journal) by shareId+dayNumber |
| `apps/web/app/c/[shareId]/day/[day]/page.tsx` | F2: public per-day page |
| `apps/web/app/c/[shareId]/day/[day]/opengraph-image.tsx` (+ `twitter-image.tsx`) | F2: per-day OG card |
| `apps/web/app/(app)/_components/ShareDayButton.tsx` | F2: "Share day N" control |
| `apps/web/lib/leaderboard.ts` | F3: rank users by Project 50 progress (friends + global) |
| `apps/web/app/(app)/_components/Leaderboard.tsx` | F3: dashboard leaderboard |
| `apps/web/lib/share-links.ts` | F4 (+F2): build referral/share URLs + the `sharer.php` URL (DRY helper) |
| `apps/web/app/(app)/_components/InviteFriendsButton.tsx` | F4: "Invite friends on Facebook" |

---

## Feature 1 — Daily Journal (wins + lessons)

> Rule #7 is "Track progress (journal the day)" but there's nowhere to write it. Add a per-day journal to the Project 50 run. (Custom challenges already store free text in `Activity.note` — do **not** duplicate that; this is for the Project 50 program path.)

### Task F1.1: `DayJournal` model + migration

**Files:** Modify `packages/db/prisma/schema.prisma`; create migration; Modify `apps/web/test/db.ts` (truncate list).

- [ ] **Step 1: Add the model** (after `Project50DayMedia`):

```prisma
model DayJournal {
  id          String    @id @default(cuid())
  challengeId String
  challenge   Challenge @relation(fields: [challengeId], references: [id], onDelete: Cascade)
  dayKey      String
  wins        String    @default("")
  lessons     String    @default("")
  updatedAt   DateTime  @updatedAt
  createdAt   DateTime  @default(now())

  @@unique([challengeId, dayKey])
  @@index([challengeId])
}
```
Add `dayJournals DayJournal[]` to the `Challenge` model's relations.

- [ ] **Step 2:** `DATABASE_URL=... pnpm --filter @project50/db exec prisma migrate dev --name day_journal` → creates the migration; `prisma generate`.
- [ ] **Step 3:** Add `Project50DayMedia` sibling `DayJournal` to the TRUNCATE list in `apps/web/test/db.ts`.
- [ ] **Step 4: Commit** `feat(db): DayJournal model`.

### Task F1.2: `lib/journal.ts` — get/upsert

**Files:** Create `apps/web/lib/journal.ts`, `apps/web/lib/journal.test.ts`.

- [ ] **Step 1: Failing test** (`journal.test.ts`): `upsertJournal(uid, {wins, lessons})` writes to the active run's today `dayKey` (resolved from `activeRun` + `localDayKey(now, run.timezone)`); `getTodayJournal(uid, now)` returns it; second upsert updates in place (unique on challengeId+dayKey). Mock `prisma` + reuse `activeRun` (export it from `lib/project50.ts` or replicate the query). Assert it throws/no-ops cleanly when there's no active run.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — `upsertJournal` uses `prisma.dayJournal.upsert({ where: { challengeId_dayKey }, create, update })`; `getTodayJournal` uses `findUnique`. Add `today.journal?: {wins,lessons}` to `Project50Today` and populate it in `getProject50State` via `buildToday` (a `dayJournal.findUnique`).
- [ ] **Step 4:** Run → PASS; coverage 100% on `journal.ts`.
- [ ] **Step 5: Commit.**

### Task F1.3: `saveJournalAction` + editor UI

**Files:** Create `apps/web/app/(app)/_actions/journal.ts`, `DayJournalSection.tsx` (+ tests); Modify `Project50View.tsx` / `Project50Client.tsx` to render it.

- [ ] **Step 1:** Action `saveJournalAction(wins: string, lessons: string)` wrapped in `withActionLogging` + `requireUser` → `upsertJournal` → `revalidatePath("/")`. Test: calls upsert with the uid + text.
- [ ] **Step 2:** `DayJournalSection` — two labelled textareas ("Today's wins", "What I learned"), a Save button (disabled while pending), shows "Saved" confirmation; pre-filled from `today.journal`; accessible (labels, `aria`), Momentum theme, autosave-on-blur OR explicit save. Test (RNTL/vitest): renders prefilled, typing + Save calls `onSave(wins, lessons)`, shows saved state. 100% coverage.
- [ ] **Step 3:** Wire into `Project50View` ACTIVE state (under the checklist, near the "Today's photo" section); pass `onSave` from `Project50Client`. Keep e2e `project50.spec.ts` selectors intact.
- [ ] **Step 4:** `/codex:review` → fix → commit → PR → CI → merge. **Verify** on `pnpm dev`: write a journal entry, reload, it persists.

---

## Feature 2 — Share a single day

> Today only the whole challenge (`/c/[shareId]`) and the final recap are shareable. Add a public **per-day** page + share card + button, gated by the challenge's `visibility`.

### Task F2.1: `lib/api/day-share.ts` loader

**Files:** Create `apps/web/lib/api/day-share.ts` (+ test).

- [ ] **Step 1: Failing test:** `getPublicDay(shareId, dayNumber)` → `{ challenge, dayNumber, dayKey, rulesCompleted: number, ruleChecks: boolean[7], media: {url}[], journal?: {wins,lessons} }` for a PUBLIC challenge; returns `null` when the challenge is PRIVATE or `dayNumber` is out of `1..lengthDays`. Reuse `getChallengeByShareId` (visibility-gated) + `addDays(startDate, n-1)` for the dayKey, then `ruleCheck`/`dayMedia`/`dayJournal` queries. Media URLs via `presignGet` (same as the recap page).
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS (100%) → **Step 5:** commit.

### Task F2.2: Public per-day page + OG/Twitter card

**Files:** Create `apps/web/app/c/[shareId]/day/[day]/page.tsx`, `opengraph-image.tsx`, `twitter-image.tsx` (+ tests). Reuse `lib/og/elements.tsx`.

- [ ] **Step 1:** `page.tsx` (RSC) → `getPublicDay`; if null → `notFound()`. Renders "Day N / 50", the 7 rule rows with ✓, the day photo(s), and the journal (wins/lessons) if present. `export const metadata` with a title. Public, no auth.
- [ ] **Step 2:** `opengraph-image.tsx` — reuse the recap OG pattern (1200×630, Momentum), headline "Day N / 50 — 7/7", `export const revalidate = 300`, timezone-safe day via `localDayKey` (the F-set already hardened `localDayKey`). `twitter-image.tsx` re-exports it.
- [ ] **Step 3:** Tests: page renders the day for a public share, `notFound` for private/out-of-range; OG route exports `size`/`contentType`/`alt`/`revalidate` and renders. 100% coverage; `/codex:review`; commit.

### Task F2.3: "Share day" button

**Files:** Create `apps/web/lib/share-links.ts` (+ test), `ShareDayButton.tsx` (+ test); Modify `Project50View`/calendar to show it on completed days.

- [ ] **Step 1:** `share-links.ts`: `dayShareUrl(origin, shareId, dayNumber)` → `${origin}/c/${shareId}/day/${dayNumber}`; `facebookSharerUrl(url)` → `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`. Pure; 100% tested.
- [ ] **Step 2:** `ShareDayButton` — on a completed day, a "Share Day N" control that: tries `navigator.share({url})`, else opens the FB sharer in a popup, with a copy-link fallback (mirror `SocialShare`'s logic — reuse its tested approach). Test the three paths.
- [ ] **Step 3:** Show it on each `complete` day in `Project50Calendar` (and on the active day when 7/7). `/codex:review`; commit → PR → CI → merge. Verify a day link opens publicly with the right OG preview.

---

## Feature 3 — Leaderboard (friends + global)

> "Dashboard is boring" → add a ranked leaderboard. **Metric:** Project 50 progress score = current day number of the user's ACTIVE run (ties broken by most recent completed `DayStatus`), with a separate "all-time" column = total completed days across the user's PROJECT50 runs.

### Task F3.1: `lib/leaderboard.ts`

**Files:** Create `apps/web/lib/leaderboard.ts` (+ test).

- [ ] **Step 1: Failing test:** `getLeaderboard(uid, { scope: "friends" | "global", now })` → array of `{ rank, userId, handle, displayName, avatarUrl, currentDay, completedDays, isMe }` sorted by `currentDay` desc then `completedDays` desc, top 50. `friends` = the set `Follow.followeeId where followerId=uid` ∪ `{uid}`; `global` = all users with a PROJECT50 run. `currentDay` = `dayNumber(run.startDate, localDayKey(now, run.timezone))` clamped to `1..50` for the active run (0 if none active). `completedDays` = count of `DayStatus.completed` across the user's PROJECT50 challenges.
- [ ] **Step 2:** FAIL → **Step 3:** implement (one grouped query per metric; avoid N+1 — fetch runs + dayStatus counts in bulk) → **Step 4:** PASS (100%) → **Step 5:** commit.

### Task F3.2: `Leaderboard` component on the dashboard

**Files:** Create `Leaderboard.tsx` (+ test); Modify `DashboardView.tsx` to render it; loader in `app/(app)/page.tsx`.

- [ ] **Step 1:** `Leaderboard` — a tabbed list (Friends | Global), rows with rank, avatar, name, "Day N" + "X days total", the current user highlighted; empty state for "no friends yet → invite some" linking to F4. Accessible table semantics. Test rows render in order, tabs switch, "me" highlighted.
- [ ] **Step 2:** Load both scopes in the dashboard RSC (`page.tsx`) and pass to `DashboardView`; place the leaderboard prominently (the previously-flat area). Keep the existing Project 50 start/checklist intact.
- [ ] **Step 3:** `/codex:review` → fix → commit → PR → CI → merge. Verify rankings with a couple seeded users.

---

## Feature 4 — Invite friends on Facebook

> One-tap "tell your friends" using the user's **referral link** via FB's **Share Dialog** (compliant; no friend-list access). Reuses `User.referralCode` + the `Referral` model + `share-links.ts` (F2.3).

### Task F4.1: `InviteFriendsButton`

**Files:** Create `InviteFriendsButton.tsx` (+ test); Modify `DashboardView.tsx` + `Rewards/celebrate` to surface it; reuse `lib/share-links.ts`.

- [ ] **Step 1:** Extend `share-links.ts`: `referralUrl(origin, code)` → `${origin}/?ref=${code}` (the existing convention from `ReferralSection`). 100% tested.
- [ ] **Step 2:** `InviteFriendsButton` (shown when logged in) — given the user's `referralCode`, builds `referralUrl` and opens `facebookSharerUrl(referralUrl)` in a popup (Share Dialog → user posts to their feed / picks recipients in FB's UI), with a `navigator.share` path on mobile and a copy-link fallback. Microcopy: "Invite friends — share Project 50". Test the FB-popup, navigator.share, and clipboard paths.
- [ ] **Step 3:** Surface it on the **dashboard** (near the leaderboard "invite some" empty state) and the **celebrate** page. Make sure the existing `/refer` page's `ReferralSection` and this button share `share-links.ts` (DRY — refactor `ReferralSection` to use `referralUrl`).
- [ ] **Step 4:** `/codex:review` → fix → commit → PR → CI → merge. **Verify:** logged in, click "Invite friends" → FB Share Dialog opens pre-filled with `https://www.project50.fit/?ref=<code>`; opening it as a new user attributes the referral (existing `Referral` flow).

> **Optional follow-up (own task):** a richer FB **Send Dialog** (send to specific friends via Messenger) requires the FB JS SDK + the app's FB App ID and only reaches friends who use the app — defer unless the Share Dialog proves insufficient.

---

## Self-review

- **Spec coverage:** (1) Journal → F1 (DayJournal model + editor on the check-in). (2) Share each day → F2 (public day page + OG card + Share button). (3) Leaderboard with friends + others → F3 (friends via `Follow`, global, on the dashboard). (4) Share app to FB friends → F4 (Share Dialog + referral link; friend-list constraint documented). All four covered.
- **Placeholder scan:** schema + lib signatures + the FB constraint are concrete; UI tasks name exact files + test paths and the data they render. No "TBD"/"handle edge cases".
- **Type consistency:** `Project50Today.journal` (F1) is consumed by the check-in; `dayShareUrl`/`facebookSharerUrl`/`referralUrl` (share-links.ts) are reused by F2 + F4; `getPublicDay`'s shape feeds the F2 page + OG. `localDayKey`/`dayNumber`/`addDays` from `@project50/core` used consistently for day math.
- **Decomposition:** four independently-shippable PRs in dependency order F1→F2→F3→F4.
