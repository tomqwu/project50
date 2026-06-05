# project50

[![CI](https://github.com/tomqwu/project50/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tomqwu/project50/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tomqwu/project50?sort=semver&label=release)](https://github.com/tomqwu/project50/releases)
[![Live](https://img.shields.io/website?url=https%3A%2F%2Fwww.project50.fit&label=www.project50.fit&up_message=online&down_message=offline)](https://www.project50.fit)
![Coverage](https://img.shields.io/badge/coverage-99%25-brightgreen)

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-Postgres-2D3748?logo=prisma&logoColor=white)
![Auth.js](https://img.shields.io/badge/Auth.js-v5-000?logo=auth0&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2052-000?logo=expo&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-Container%20Apps-0078D4?logo=microsoftazure&logoColor=white)
![Terraform](https://img.shields.io/badge/IaC-Terraform-7B42BC?logo=terraform&logoColor=white)

A habit-transformation product built around the **Project 50** program: **7 fixed
daily rules, 50 days, all-or-nothing** — miss a rule and the run **hard-resets** to
day 1. Don't like the fixed rules? Build a **custom plan** instead. Web is the
reference implementation; native iOS/Android mirror it.

> Status: **Web app is live in production** at
> [`https://www.project50.fit`](https://www.project50.fit) (Azure Container Apps,
> Canada Central). The Project 50 program + custom plans, daily journal, leaderboard,
> per-day sharing, and the native Expo app are shipped. M0 hardening is largely done
> and the engagement/social epic (#263) is closed. See [`ROADMAP.md`](ROADMAP.md) for
> the milestone-by-milestone state and the open follow-ups.

## What it does

- Run the **Project 50** program — **7 fixed daily rules over 50 days, all-or-nothing**.
  Complete every rule each day to advance; miss one and the run **hard-resets to day 1**.
- Or run a **custom plan** — your own rules / length when the fixed program isn't the fit.
- Keep a **daily journal** (wins + lessons) alongside each day's completion.
- Log a day with a **photo** (PNG/JPEG/WebP, uploaded via presigned URLs) and **remove** a
  photo you no longer want. Photos render across the app.
- Earn **streaks**, **badges**, and a **day-50 finale**.
- See a **leaderboard** — friends and global — on the dashboard.
- **Share a single completed day** via a public page + generated **OG card** image, with
  honest, capability-aware platform options:
  - **Facebook** — opens the Facebook sharer for the public day URL.
  - **Instagram** — IMAGE-based and **honest**: IG has no web link-share, so the only
    compliant path is sharing the day-card image through the OS share sheet; when that
    isn't available we never claim a post happened (copy-link / save-image fallback). The
    Instagram option sits behind the `shareInstagram` feature-flag kill-switch.
  - generic **Share…** (native share sheet) and **Copy link**.
- **Invite friends on Facebook** via the Share Dialog + a **referral** link.

## Tech stack

TypeScript monorepo (pnpm workspaces):

| Package | Responsibility |
|---|---|
| `packages/core` | Pure, framework-free domain logic (Project 50 program/date helpers, streaks, completion, milestones, validation). The testable heart. |
| `packages/db` | Prisma schema + client (PostgreSQL). |
| `packages/ui` | The **"Momentum"** design system (charcoal + electric-volt accent). |
| `packages/config` | Shared ESLint + Vitest config (incl. the 99% coverage gate). |
| `packages/recap` | Remotion compositions + render pipeline for day/week/50-day recap MP4s. |
| `apps/web` | Next.js 15 (App Router) PWA + API route handlers. |
| `apps/mobile` | React Native (Expo SDK 52) app — reuses `@project50/core` + REST API. |

- **Runtime (prod):** **Azure Container Apps** + **Postgres Flexible Server** + **Azure
  Blob** for media (via the app's managed identity), in Canada Central. IaC is Terraform
  (`infra/azure`); deploys run locally, gated on CI-green + merged + tagged.
- **Media storage:** Azure Blob in production; **MinIO / S3-compatible storage is dev-only**
  (the backend is selected by env — see [`infra/azure/README.md`](infra/azure/README.md)).
- **Auth:** Auth.js v5 — Facebook OAuth is wired in prod; Google OAuth + email magic-link
  sign-in are in-flight (see the roadmap).
- **Feature flags:** a lightweight typed flag registry gates risky surfaces, including the
  **Instagram-share kill-switch**. Operator runbook:
  [`docs/FEATURE-FLAGS.md`](docs/FEATURE-FLAGS.md).

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

The simplest path is the **Makefile** (run `make` to list every target):

```
make setup
make seed
make dev
```

`make setup` installs deps, creates `.env`, starts Postgres + MinIO, applies migrations, and
installs the Playwright browser. `make seed` populates a rich demo account so the app shows real
data on first login. `make dev` runs the web app — then open `http://localhost:3000` in your
browser.

> Note: paste each command on its own line. Don't paste the `http://localhost:3000` URL into a
> terminal — type it into your browser.

**Demo flow (dev-only):** after `make seed`, open `http://localhost:3000/signin` and click
**"Continue as demo account"** to sign in as the seeded `demo` user and land on a populated
dashboard with an active challenge, streak, feed content from Maya and Leo, and earned milestones.

> The dev sign-in button and the demo seed are **local/dev-only** — the sign-in button is gated
> by `AUTH_E2E=1` (set in `.env.example`) and the `NODE_ENV !== "production"` check; the seed
> script lives in `packages/db` and is never run in production.

Equivalent without Make (note Prisma needs the env loaded; the `make`/`pnpm` db scripts do this
for you via `dotenv`):

```
pnpm install
cp .env.example .env
docker compose up -d postgres minio
pnpm --filter @project50/db migrate:deploy
pnpm --filter @project50/web dev
```

## Common tasks

| Make | pnpm | What it does |
|---|---|---|
| `make test` | `pnpm test` | Unit + integration tests, all packages (hard **99%** gate). |
| `make e2e` | `pnpm test:e2e` | Playwright end-to-end tests (builds + serves the web app). |
| `make smoke` | — | Quick end-to-end sanity check (API journey: sign in → create → log → verify). |
| `make seed` | — | Populate the demo account (challenges, streaks, photos, feed) for an instant demo. |
| `make test-mobile` | `pnpm --filter @project50/mobile test` | Mobile Jest tests (no services needed). |
| `make typecheck` | `pnpm typecheck` | `tsc --noEmit` across packages. |
| `make lint` | `pnpm lint` | ESLint (`--max-warnings=0`). |
| `make build` | `pnpm --filter @project50/web build` | Production build of `apps/web`. |
| `make ci` | — | Everything CI runs: lint, typecheck, tests, e2e. |
| `make reset` | — | Drop + recreate the dev database. |

`make test`/`make e2e` start the services and apply migrations first, so they work from a clean
checkout. Run `make` with no target to see the full list.

## Quality bar

- **Hard 99% coverage** (lines + branches) across the repo via Vitest. Exclusions are
  explicit and justified in [`docs/coverage-exclusions.md`](docs/coverage-exclusions.md) —
  never padded with assertion-free tests.
- **Playwright e2e** journeys must be green.
- CI (GitHub Actions) runs install → prisma migrate → lint → typecheck → test+coverage →
  e2e on every PR. Work ships via PRs that auto-merge once CI is green.

## Roadmap

The web app is **live in production** and the engagement/social epic (#263 — daily
journal, per-day share, leaderboard, Facebook invite) has shipped. M0 hardening
(security review, secrets out of Terraform state, monitoring/alerts, Postgres backups
+ restore drill, custom-domain binding, feed pagination, N+1 collapse) is largely
done; open follow-ups include shared rate-limiter (Redis), media backups, the apex
domain, and production Google / email sign-in.

The full milestone plan (M0 Foundation & Hardening → M5 Growth & Scale, across
**web → iOS → Android**), what has shipped, and the open follow-up issues live in
[`ROADMAP.md`](ROADMAP.md), tracked in GitHub Issues / Milestones. Per-feature design
specs live in [`docs/superpowers/specs/`](docs/superpowers/specs/) and implementation
plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).
