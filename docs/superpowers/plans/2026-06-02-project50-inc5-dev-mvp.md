# project50 Increment 5 — Dev Sign-in + Demo Seed ("wake up and it works")

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make project50 instantly usable and demo-able locally without OAuth setup: a one-click **dev sign-in** (gated so it can never run in production), correct local **env loading** for `next dev`, instant recaps in dev, and a **demo seed** that populates a rich account (a 50-day challenge mid-streak, badges, followees + feed) so the app shows real life on first login. Hard 99% gate on web; the seed script lives in `packages/db` (outside the coverage gate, like migrations).

**Why:** The app is feature-complete but, on first run, login-gated + empty — which kills the demo. This increment turns it into a working MVP you can open and immediately see streaks, a feed, and a celebrate/recap.

---

### Task 1: Local env + dev sign-in (auth bypass, gated)

**Files:** `apps/web/package.json`, `apps/web/auth.ts`, `apps/web/app/signin/SignInButtons.tsx` (+ test), `apps/web/auth.test.ts`, `apps/web/e2e/ui-journey.spec.ts`, `.env.example`.

- [ ] **Env loading:** add `dotenv-cli` to `apps/web` devDeps; change the `dev` script to `dotenv -e ../../.env -- next dev` so `next dev` gets `AUTH_SECRET`/`DATABASE_URL`/`S3_*` from the monorepo-root `.env`. DO NOT change `build`/`start` (CI's e2e webServer runs `pnpm build && pnpm start` and injects env itself — wrapping those with a required `.env` would break CI).
- [ ] **`.env.example`:** set `AUTH_E2E="1"` and add `RECAP_FAKE="1"` (dev conveniences: the dev sign-in button + instant placeholder recaps; neither is ever set in a real deployment).
- [ ] **Harden the e2e/dev provider:** in `apps/web/auth.ts`, register the credentials provider only when `process.env.AUTH_E2E === "1" && process.env.NODE_ENV !== "production"` (belt-and-suspenders so it can't activate in prod even if the env leaks). Update `auth.test.ts` to cover BOTH branches (prod → no e2e provider; non-prod+flag → e2e provider present).
- [ ] **Dev button:** `SignInButtons.tsx` — when the e2e button is shown, sign in with a FIXED handle `"demo"` (label it "Continue as demo account"). This maps to the seeded demo user (Task 2). Update `SignInButtons.test.tsx` to assert the `"demo"` handle.
- [ ] **Keep e2e isolated:** `ui-journey.spec.ts` currently clicks the dev button (which now uses the fixed `"demo"` handle). Switch it to the programmatic CSRF + `/api/auth/callback/e2e` sign-in with a `crypto.randomUUID()` handle (same pattern as `journey.spec.ts`/`share.spec.ts`) so the test stays isolated and doesn't share the `"demo"` account. Keep its assertions.
- [ ] Verify `pnpm --filter @project50/web test` 100%, typecheck, lint; `pnpm test:e2e` all green. Commit `feat(web): gated dev sign-in + local env loading`.

### Task 2: Demo seed

**Files:** `packages/db/prisma/seed.ts` (or `packages/db/scripts/seed.mjs`), `packages/db/package.json` (`seed` script via dotenv), `Makefile` (`seed` target), `apps/web/lib/api/...` only if a shared helper helps, README.

- [ ] **Seed script** (`packages/db`, runs with `dotenv -e ../../.env`): idempotent — clears the `demo` user's existing challenges/follows (cascade) then recreates a rich dataset:
  - User `demo` (displayName "Demo Runner"); two followee users (`maya`, `leo`) the demo follows.
  - A primary TARGET challenge "Work out 1 hr/day" (unit min, dailyTarget 60), `startDate` = 24 days ago (UTC), visibility PUBLIC: activities for ~22 of the last 24 days (a couple of gaps), amounts summing to/over 60 on completed days; corresponding `DayStatus` rows (use `@project50/core` `computeDayCompletion`/day helpers to compute totals + completion HONESTLY, not hand-faked); earned `Milestone`s computed via `@project50/core` `evaluateMilestones` (COMPLETED_7, COMPLETED_25 if applicable, STREAK_7). A second simpler BINARY challenge "Read 30 min".
  - Followees each own a PUBLIC challenge with a few recent activities (so the demo's **feed** has content); add a couple of `Reaction` CHEERs on the demo's activities (so `cheering` count is real).
  - Compute `startDate`/`dayKey`s from a timestamp passed into the script (the script may read the real clock since it's a dev tool, not a workflow script) so "today" is correct.
  - Photos: OPTIONAL/skip for now — seed activities without media (UI shows neutral placeholders). (Photo seeding to MinIO is a documented follow-up.)
  - Put any non-trivial data-shaping in a small pure helper and unit-test it IF it lives somewhere covered; the seed script file itself is a dev tool in `packages/db` (no coverage gate there) — keep it straightforward and correct, reusing `@project50/core` for all rule math (no duplicated streak/completion logic).
- [ ] `packages/db/package.json`: `"seed": "dotenv -e ../../.env -- tsx prisma/seed.ts"` (add `tsx` devDep if needed). `Makefile`: `seed: env services migrate` → `pnpm --filter @project50/db seed`.
- [ ] **README:** document the dev flow — `make setup`, `make seed`, `make dev`, then on `/signin` click "Continue as demo account" to land on the populated dashboard. Note the seed/dev-signin are dev-only (gated).
- [ ] Run `make seed` against the local DB and verify (query) the demo user has the challenge, dayStatuses, milestones, follows, feed activities, and cheers. Commit `feat(db): demo seed for instant MVP`.

### Task 3: Green + PR/auto-merge

- [ ] Full `pnpm test` (≥99%, web), `pnpm typecheck`, `pnpm lint`, `pnpm --filter @project50/web build` (exit 0), `pnpm test:e2e` (all green). Manually `make seed` then `make dev` and confirm the demo dashboard shows the challenge + streak (best-effort; document what you verified).
- [ ] Commit; push; PR; auto-merge on green.

---

## Self-Review (completed)

- **Scope:** Pure DX/MVP enablement — no change to the product's security posture in prod (dev sign-in double-gated by `AUTH_E2E` + `NODE_ENV!=="production"`). The seed is a dev tool; it reuses `@project50/core` for all rule math (no faked streaks/completion).
- **Coverage:** web stays at the 99% gate (auth.ts new branch covered; SignInButtons handle tested; ui-journey switched to API sign-in keeps e2e green). The seed script lives in `packages/db` which is outside the coverage gate (like migrations) — honest, documented.
- **CI safety:** only the web `dev` script is wrapped with `dotenv` (CI never runs `next dev`); `build`/`start` untouched so the e2e webServer + CI keep working with injected env. `RECAP_FAKE=1`/`AUTH_E2E=1` are in `.env.example` (local) — CI sets its own env and is unaffected.
- **Honesty:** no faked data — seed amounts/dayStatuses/milestones are computed by core; photos are omitted (placeholders) rather than faked; dev sign-in is a real gated provider, not a disabled auth check.
