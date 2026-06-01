# project50

A social progress-tracking app built around **50-day challenges** — track your daily
progress, follow friends, and celebrate milestones with shareable cards. Eventual
integrations: Facebook, Instagram, WeChat.

> Status: **early development.** Phases 0–3 are merged; Phase 4 (sharing + PWA + full e2e) is
> next. See the roadmap below.

## What it does

- Run one or more **50-day challenges** — either a daily **target** you accumulate toward
  (e.g. "work out 60 min/day", where a run counts toward the hour) or a simple **binary**
  habit (done / not done).
- Log daily **activities** with a photo, note, numeric amount, and mood.
- Earn **streaks**, **badges**, and a **day-50 finale**.
- **Follow** friends, see their progress in a feed, and cheer/comment.
- **Share** milestones via a generated image card, a public link, and the Web Share API.

## Tech stack

TypeScript monorepo (pnpm workspaces):

| Package | Responsibility |
|---|---|
| `packages/core` | Pure, framework-free domain logic (streaks, completion, milestones, validation). The testable heart. |
| `packages/db` | Prisma schema + client (PostgreSQL). |
| `packages/config` | Shared ESLint + Vitest config (incl. the 99% coverage gate). |
| `apps/web` | Next.js (App Router) PWA + API route handlers. |

Auth: Google/Facebook OAuth (Auth.js). Media: S3-compatible object storage (MinIO in dev).
Visual design direction: **"Momentum"** (charcoal + electric-volt accent) — see
`design-explore/momentum/`.

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
- [ ] **Phase 4 — Create-challenge UI + Sharing + PWA + full e2e** — in progress.

Design specs live in [`docs/superpowers/specs/`](docs/superpowers/specs/) and implementation
plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).
