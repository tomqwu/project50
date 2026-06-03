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

- ✅ Mobile Facebook OAuth (end-to-end) — merged (PR #14)
- 🔜 Project 50 program (web) — spec + plan in `docs/superpowers/`
- 🔜 This backlog — see GitHub Issues / Milestones
