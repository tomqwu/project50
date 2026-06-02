# project50

A social progress-tracking app built around **50-day challenges** — track your daily
progress, follow friends, and celebrate milestones with shareable cards. Eventual
integrations: Facebook, Instagram, WeChat.

> Status: **Increment 4 (native Expo app) complete on `feat/inc4-native-expo`.** Phases 0–4 +
> Increments 1–3 are merged. Native app (Feed, Celebrate, share, navigation) is code-complete
> and unit-tested. A–E program complete at the code level — see the roadmap below.

## What it does

- Run one or more **50-day challenges** — either a daily **target** you accumulate toward
  (e.g. "work out 60 min/day", where a run counts toward the hour) or a simple **binary**
  habit (done / not done).
- Log daily **activities** with a **photo** (PNG/JPEG/WebP, directly uploaded to MinIO/S3 via
  presigned URLs), note, numeric amount, and mood. Photos render in the feed and celebrate view.
- Earn **streaks**, **badges**, and a **day-50 finale**.
- **Follow** friends, see their progress in a feed, and cheer/comment.
- **Share** milestones via a generated image card, a public link, and the Web Share API.
- **Generate recap videos** (day / week / 50-day) — Momentum-styled MP4s rendered via
  [Remotion](https://www.remotion.dev/), stored in S3/MinIO, preview/download/share from the
  celebrate screen. CI/e2e use `RECAP_FAKE=1` (no Chromium); real renders run locally via
  `pnpm --filter @project50/recap render:sample`.
- **Hybrid social sharing** to Facebook, Instagram, and WeChat: each platform is capability-flagged
  — when API credentials are configured (env: `FB_PAGE_ID`/`FB_PAGE_TOKEN`, `IG_USER_ID`/`IG_TOKEN`,
  `WECHAT_APP_ID`) the Publisher calls the real platform API; otherwise it falls back to a deep link
  (Facebook sharer URL) or Web Share API. The UI surfaces capability reasons truthfully and never
  shows "Posted!" for a non-API share. Image-card sharing requires the challenge to be PUBLIC.

## Tech stack

TypeScript monorepo (pnpm workspaces):

| Package | Responsibility |
|---|---|
| `packages/core` | Pure, framework-free domain logic (streaks, completion, milestones, validation). The testable heart. |
| `packages/db` | Prisma schema + client (PostgreSQL). |
| `packages/config` | Shared ESLint + Vitest config (incl. the 99% coverage gate). |
| `packages/recap` | Remotion compositions + render pipeline for day/week/50-day recap MP4s. |
| `apps/web` | Next.js (App Router) PWA + API route handlers. |
| `apps/mobile` | React Native (Expo SDK 52) app — reuses `@project50/core` + REST API. |

Auth: Google/Facebook OAuth (Auth.js). Media: S3-compatible object storage (MinIO in dev).
Visual design direction: **"Momentum"** (charcoal + electric-volt accent) — see
`design-explore/momentum/`.

## Native app (Expo)

`apps/mobile` is a React Native (Expo SDK 52) app that delivers the core project50 flows on mobile.

**Status:** Code-complete + unit-tested with Jest/RNTL. Reuses `@project50/core` domain logic and the same REST API as the web app. On-device run and device/e2e verification are pending simulator access.

| Feature | Status |
|---------|--------|
| API client (all endpoints) | Tested (Jest, fetch mocked) |
| Session / auth | Tested (SecureStore + OAuth wired) |
| Dashboard screen | Tested (RNTL) |
| Log Activity screen (photo upload) | Tested (RNTL) |
| Feed screen (cheer + optimistic update) | Tested (RNTL) |
| Celebrate screen (recap generate + share) | Tested (RNTL) |
| React Navigation stack | Wired (native-glue exclusion) |

**Run on device / simulator:**

```bash
pnpm --filter @project50/mobile start   # opens Expo Go / development build
```

**Tests (headless Jest, no simulator required):**

```bash
pnpm --filter @project50/mobile test
```

Coverage gate: 99% on `src/lib/**`, `src/viewmodels/**`, `src/components/**`, `src/screens/**`. Native-only glue (navigator container, `registerRootComponent`, picker/share native call sites) is excluded and documented in [`apps/mobile/COVERAGE.md`](apps/mobile/COVERAGE.md).

## Getting started

Prerequisites: Node 20+ (CI pins 20; works on newer), pnpm 9, Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d            # Postgres + MinIO
pnpm --filter @project50/db exec prisma migrate dev
pnpm --filter @project50/web dev   # http://localhost:3000
```

## Scripts (run from the repo root)

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests + coverage, per package (hard **99%** line/branch gate). |
| `pnpm test:e2e` | Playwright end-to-end tests (builds + serves the web app). |
| `pnpm typecheck` | `tsc --noEmit` across packages. |
| `pnpm lint` | ESLint (`--max-warnings=0`). |
| `pnpm build` | Production build of `apps/web`. |

## Quality bar

- **Hard 99% coverage** (lines + branches) across the repo via Vitest. Exclusions are
  explicit and justified in [`docs/coverage-exclusions.md`](docs/coverage-exclusions.md) —
  never padded with assertion-free tests.
- **Playwright e2e** journeys must be green.
- CI (GitHub Actions) runs install → prisma migrate → lint → typecheck → test+coverage →
  e2e on every PR. Work ships via PRs that auto-merge once CI is green.

## Roadmap

The full product is decomposed into sub-projects, each with its own spec → plan → build:

- **A. Backend + data model** · **B. Web PWA** — the current first slice.
- **C. Native iOS/Android apps.**
- **D. Deep Facebook / Instagram / WeChat publishing.**
- **E. Recap animation engine** (day/week/50-day highlight videos).

Within the first slice, phased delivery:

- [x] **Phase 0 — Foundation:** monorepo, dev env, CI, coverage gate, Playwright.
- [x] **Phase 1 — Core domain + schema:** challenges, activities, streaks, milestones, validation.
- [x] **Phase 2 — Auth + API**.
- [x] **Phase 3 — Web UI** (Momentum design system + screens).
- [x] **Phase 4 — Create-challenge UI + Sharing + PWA + full e2e** — complete. First slice (A + B) done.
- [x] **Increment 1 — Photo upload end-to-end:** presigned S3/MinIO upload, media stored in DB,
  feed + celebrate render real photos, full e2e round-trip, MinIO in CI.
- [x] **Increment 2 — Recap animation engine:** Remotion compositions (day/week/50-day),
  render pipeline with `FakeRecapRenderer` (CI-safe) + `RemotionRenderer` (real h264),
  `POST /api/challenges/:id/recap` (owner-only) → MP4 stored in MinIO → signed URL,
  celebrate screen with generate/preview/download/share, full e2e with fake renderer.
- [ ] **Increment 3 — Hybrid social publishing (in progress):** `Publisher` abstraction with
  per-platform adapters (Facebook Graph API, Instagram Content Publishing API, WeChat JS-SDK) —
  capability-flagged: API when credentials are configured, DEEPLINK/WEBSHARE fallback otherwise.
  `GET /api/publish/capabilities` + `POST /api/challenges/:id/publish`. `SocialShare` panel on the
  celebrate screen with asset toggle (Image card / Recap video) and honest capability labels.
  Full e2e: assert panel renders, honest labels visible, Facebook deeplink (`window.open` stubbed).
- [x] **Sub-project C — Native iOS/Android (Expo):** `apps/mobile` — code-complete + unit-tested (207 tests, 100% coverage on testable dirs); screens: Dashboard, Log Activity (photo), Feed (cheer + optimistic update), Celebrate (recap generate + share); React Navigation stack wired; device verification pending simulator access.

**A–E program: COMPLETE at the code level.** All sub-projects (A: backend + data model, B: web PWA, C: native Expo app, D: social publishing, E: recap animation engine) are implemented and unit-tested. On-device / e2e verification of the native app (C) is the one remaining open item pending simulator access.

Design specs live in [`docs/superpowers/specs/`](docs/superpowers/specs/) and implementation
plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).
