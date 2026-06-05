# Project 50 — Product Roadmap to Commercial GA

> Path to a fully commercialized, production-ready product across **web → iOS → android**.
> Tracked in GitHub Issues (milestones `M0`–`M5`, `epic:*` / `platform:*` / `type:*` labels).
> Per-feature implementation detail lives in `docs/superpowers/plans/`.

## North star

A habit-transformation app built around the **Project 50** program (7 fixed daily
rules, 50 days, all-or-nothing with a hard reset), plus **custom plans**, monetized
via subscription, shipped on web first, then native iOS and Android.

## Milestones (delivery order)

| # | Milestone | Outcome | Gate to next |
|---|-----------|---------|--------------|
| **M0** | Foundation & Hardening | Web app is production-grade: CI/CD, infra, observability, security, QA | Green pipeline + staging + monitoring live |
| **M1** | Web GA | Public web launch — Project 50 core, custom plans, full auth, social, recap, polished design | Real users can complete a 50-day run on web |
| **M2** | Monetization (Web) | Subscriptions, paywall, billing, legal/compliance | Paying customers on web |
| **M3** | iOS App | Native iOS parity, IAP, push, App Store launch | App live in App Store |
| **M4** | Android App | Native Android parity, Play Billing, FCM, Play Store launch | App live in Play Store |
| **M5** | Growth & Scale | Notifications, analytics, performance, support ops, a11y/i18n | Sustainable growth loop + SLOs |

## Epics

**Product:** `project50`, `custom-plans`, `auth`, `social`, `recap-media`,
`notifications`, `monetization`, `design-system`
**Platform:** `ios`, `android`
**Production:** `infra`, `observability`, `security-privacy`, `performance`, `qa`,
`store-readiness`, `analytics-growth`, `support-ops`, `legal-compliance`,
`accessibility-i18n`

## Operating principles

- **TDD + coverage gate** on every code story (the repo's existing bar).
- **Web is the reference implementation**; iOS/Android mirror its behavior.
- **Each story is independently shippable** behind a flag where needed.
- **Security & privacy are not a phase** — they appear in every milestone.

## Status

The **web app is live in production** at `https://www.project50.fit` (Azure Container
Apps, Canada Central). Snapshot of what has shipped vs. what's open:

**Shipped — M1 engagement/social epic (#263, closed):**

- ✅ Mobile Facebook OAuth (end-to-end) — PR #14
- ✅ Project 50 program (web) — 7 fixed daily rules, 50 days, all-or-nothing hard reset, + custom plans
- ✅ F1 — daily journal (wins + lessons) — #262
- ✅ F2 — share a single completed day (public page + OG card) — #286
- ✅ F3 — leaderboard (friends + global) on the dashboard — #287
- ✅ F4 — invite friends on Facebook (Share Dialog + referral) — #299
- ✅ Feature-flag API + **Instagram-share kill-switch** + analytics events — #285 / #316
  (operator runbook: [`docs/FEATURE-FLAGS.md`](docs/FEATURE-FLAGS.md))

**Shipped — M0 foundation & hardening (largely done):**

- ✅ Lock down `/api/metrics` (was publicly reachable without auth) — #290
- ✅ Security review executed against the live deployment — #274
- ✅ Auth hardening (no `AUTH_E2E` in prod, secure cookies) — #277
- ✅ Monitoring, dashboards & alerts (5xx, restarts, Postgres CPU/storage/connections) — #271
- ✅ Automated Postgres backups + tested restore drill — #272
- ✅ DB/Auth secret **values** removed from Terraform state — #267
- ✅ Custom-domain (`www`) binding + cert + policy exemptions in Terraform — #268
- ✅ Hardening/perf: disable `x-powered-by` (#292), paginate the feed (#293),
  collapse the `getProject50State` hard-reset N+1 (#294), assert Blob soft-delete OFF
  for GDPR hard-erase (#295), harden release-title base64 decode (#305)

**Open follow-ups:**

- 🔜 Rate limiter is per-replica in-memory — move to a shared store (Redis) now that `max_replicas=4` — #319
- 🔜 Media (Blob) backup — cross-account private-container mirror — #320
- 🔜 Backup hardening — dedicated read-only backup DB role + drill verification-target fix — #321
- 🔜 Apex `project50.fit` not bound (TLS reset, no apex→www redirect) — #291
- 🔜 Rotate the leaked Facebook App Secret — #269
- 🔜 Sentry error monitoring live in prod — #270
- 🔜 Stand up / formally designate a hardened PROD environment — #273
- 🔜 Google OAuth in production — #275
- 🔜 Email magic-link sign-in in production — #276

See GitHub Issues / Milestones for the full backlog and live state.
