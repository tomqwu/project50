# project50 — Design Spec (First Slice: Backend + Web PWA)

> Date: 2026-06-01
> Status: Approved design, pending spec review
> Scope: Sub-projects A (backend + data model) + B (web PWA). C/D/E deferred.

## 1. Product

project50 is a social progress-tracking app built around **50-day challenges**. A user
commits to a goal, logs daily progress, follows friends, sees their progress in a feed,
and celebrates milestones with shareable cards. The product supports four challenge
shapes the user confirmed: a single 50-day challenge as the spine, open-ended use,
multiple parallel challenges, and (later) group challenges.

### 1.1 In scope for this slice
- Social-login accounts (Google + Facebook OAuth only; no passwords).
- Create and run 50-day challenges (target-based or simple binary).
- Daily check-ins ("activities") with photo, note, numeric amount, mood, done/skip.
- Streaks, badges, and a day-50 finale.
- Follow model + feed + cheer/comment reactions.
- Sharing: server-generated milestone **image card** + **public link** page + Web Share API.
- Responsive, installable PWA.

### 1.2 Explicitly deferred (separate sub-projects, each its own spec)
- **C** — Native iOS/Android apps (capture-optimized; tested with Detox/Appium).
- **D** — Deep Facebook / Instagram / WeChat *posting* integrations (OAuth-publish, APIs).
- **E** — Auto-generated recap **animation** videos (day/week/50-day motion design).

In this slice "share to FB/IG/WeChat" is satisfied by a generated image + Web Share +
public link — no platform publishing-API approval required.

## 2. Visual system — "Momentum"

Chosen from three explored directions (see `design-explore/`).

- **Mood:** athletic, bold, motivating — "crush the streak", premium not hype.
- **Palette:** warm near-black charcoal background `#121013`; card surface `#1C1A1E`,
  secondary `#232026`; off-white text `#F2F0EC`; muted gray `#8C8A86`; single accent
  electric volt `#D6FF3F` (progress, key numbers, primary CTA, glow). Hairlines
  `rgba(242,240,236,0.08)`. No gradients-as-slop, no purple, no emoji-as-icons.
- **Type:** display & numerals = **Anton** (huge condensed); body & UI = **Sora**;
  uppercase tracked micro-labels.
- **Signature:** glowing SVG progress **ring** on the dashboard; oversized hero numbers;
  high contrast with generous black breathing room and one volt focal point per screen.
- Reference prototype: `design-explore/momentum/index.html`.

## 3. Architecture

A single **TypeScript monorepo** (pnpm workspaces).

```
project50/
  apps/web/            Next.js (App Router) PWA + API route handlers
  packages/core/       Pure domain logic (no HTTP, no Prisma, no React)
  packages/db/         Prisma schema + client + migrations + seed
  packages/ui/         Shared React components (Momentum design system)
  packages/config/     Shared tsconfig / eslint / vitest config
```

- **API** = Next.js Route Handlers (`apps/web/app/api/...`). No separate server process.
- **`packages/core` is the testable heart**: pure functions for streak calculation,
  target/day completion, badge rules, validation. Knows nothing about frameworks.
  The API layer is thin: parse → call core → persist via `packages/db` → respond.
- **Database:** PostgreSQL via Prisma.
- **Media:** S3-compatible object storage (MinIO in dev) via presigned uploads. DB stores
  only object keys + metadata, never blobs.
- **Auth:** Auth.js (NextAuth) with Google + Facebook providers; session via secure cookie.
- **Image cards:** server-rendered OG-style PNG via Satori / `@vercel/og`, Momentum-styled.

### 3.1 Key boundary
`packages/core` is framework-free and exhaustively unit-tested. This is what makes a hard
99% coverage target meaningful rather than performative.

## 4. Domain model

```
User        id, handle (unique), displayName, avatarUrl, createdAt
Identity    id, userId, provider (google|facebook), providerAccountId
Follow      followerId, followeeId            (asymmetric; unique pair)
Challenge   id, ownerId, title, goalType (TARGET|BINARY),
            unit? (min|km|pages|reps|custom), dailyTarget? (number),
            startDate, lengthDays (default 50; field supports other lengths for
              open-ended use, but this slice's UI exposes 50 only),
            visibility (PUBLIC|FOLLOWERS|PRIVATE),
            shareId (for public link), createdAt
Activity    id, challengeId, userId, date, activityType?, amount?, done (bool),
            note?, mood? (1..5), createdAt        (a "check-in")
ActivityMedia id, activityId, objectKey, width, height, order
DayStatus   challengeId, date, totalAmount, completed (bool)   (derived; cached)
Reaction    id, activityId, userId, kind (CHEER|COMMENT), text?, createdAt
Milestone   id, challengeId, kind (DAY7|DAY25|DAY50|STREAK_N), earnedAt
```

Notes:
- **TARGET** challenges accumulate `amount` from one or more activities/day toward
  `dailyTarget`; the day is `completed` when the sum ≥ target.
- **BINARY** challenges complete when an activity with `done = true` exists that day.
- `DayStatus` is derived from activities but cached for fast streak/feed reads; it is always
  recomputable from activities (source of truth = activities).

## 5. Core user flows

1. **Sign in** — Google/Facebook → first-run picks a handle → create first challenge.
2. **Dashboard** — day X/50, today's volt ring (e.g. 35/60 min), streak, badges, "Log an
   activity"; list of other active challenges.
3. **Log activity** — pick type, enter amount, add photo(s), note, mood → day auto-completes
   when target met (or via done toggle for binary).
4. **Feed** — reverse-chron activities from followees; cheer (👏) and comment.
5. **Celebrate** — milestone toasts in-app; a dedicated **day-50 finale** screen; generate a
   Momentum image card → Save image / Copy public link / Web Share.
6. **Public page** — `/c/:shareId` read-only celebration/profile page for non-users; respects
   visibility (404 when private).

## 6. Error handling

- Validation lives in `packages/core`: no future-dated activities, `amount ≥ 0`, no logging
  to a challenge you don't own, no double-completing, mood ∈ 1..5.
- API returns typed error envelopes; UI renders inline messages, never raw errors.
- Media upload failure degrades gracefully: the activity saves text-only and surfaces a retry.
- Public pages 404 cleanly for private/missing challenges; no data leak across visibility.

## 7. Testing strategy — hard 99% coverage

- **Unit (Vitest):**
  - `packages/core` — near-exhaustive: streaks (including gaps, timezone boundaries),
    target completion, binary completion, badge/milestone rules, all validation branches.
  - API route handlers — success + every typed-error path (mocked db/storage).
  - `packages/ui` components & hooks — render + interaction (Testing Library).
- **E2E (Playwright):** seeded test DB + mocked OAuth. Journeys (all required-green in CI):
  sign-in & onboarding; create challenge (target + binary); log activity → ring updates →
  streak increments; multi-activity day completes target; feed cheer + comment; earn day-50
  milestone → generate card → public link loads → private challenge 404s; PWA installability.
- **Coverage gate (CI):** hard **99% line + branch across the whole repo**. Files that
  genuinely cannot/should not be unit-tested (generated Prisma client, Next.js config,
  type-only files, the bootstrap entrypoints) are **explicitly listed** in coverage
  `exclude` with a one-line justification each — exclusions are visible and reviewed, never
  used to silently inflate the number, and we do not pad with assertion-free tests.

## 8. Process & operations

These are standing requirements for *how* the work is executed.

- **Sub-agent-driven development:** every implementation task in the plan is executed by a
  dedicated sub-agent following test-driven development (test first, then code), with a
  review pass per task. Independent tasks run in parallel sub-agents using isolated git
  worktrees to avoid conflicts.
- **Issue/PR monitoring:** the repo is `github.com/tomqwu/project50` (public, push access). A
  recurring watcher reports, each cycle: open issues, open PRs and their review/merge state,
  CI pass/fail, and the coverage number vs the 99% gate. Set up via a scheduled/looping agent
  once the first PRs exist.

## 9. Open questions / risks

- **OAuth in CI/e2e:** real Google/Facebook OAuth can't run in CI — we mock the provider at
  the Auth.js boundary for e2e and document a manual smoke test for real providers.
- **Timezone for "day"/streaks:** day boundaries are user-local; `core` takes an explicit
  timezone so logic stays pure and testable. Confirmed approach, called out as a known
  complexity hotspot.
- **99% everywhere cost:** accepted by the user; mitigated by the thin-API / pure-core split
  and honest exclusions.

## 10. Next sub-projects (roadmap, not this slice)
- **C** Native apps · **D** FB/IG/WeChat publishing · **E** recap animation engine.
Each gets its own brainstorm → spec → plan → build cycle, building on this slice's API.
