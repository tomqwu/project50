# Clear Entire Backlog — 24h Autonomous Execution Plan

> **For agentic workers:** Execute with parallel worktree-isolated subagents. Loop until `gh issue list --state open` AND `gh pr list --state open` are BOTH empty. Merge ONLY CI-green PRs (`gh run view --json conclusion`; this repo has no branch protection so `gh pr merge` ignores CI status). No user prompts.

**Goal:** Drive the GitHub backlog (issues + PRs) to zero, autonomously.

**Architecture:** Continuous parallel-agent waves. Each issue → a real deliverable: web feature (TDD, 99% coverage), env-gated code that no-ops without keys (Sentry/Stripe pattern), cross-platform Expo RN screens (one screen = iOS+Android), infrastructure-as-config + docs, or doc drafts. Only the actual cloud-account/credential step is left as a documented TODO; the CODE/CONFIG is the deliverable.

**Operating rules (every wave):**
- 4–6 disjoint agents per wave; ≤1 schema-toucher and ≤1 package.json-toucher per wave; each agent its own `p50_<slug>` test DB.
- After each agent: open PR → watch CI → **merge only if conclusion == success** → else iterate/SendMessage the agent.
- Keep web 99% coverage gate + mobile 99% gate green; typecheck + lint clean; builds succeed without optional keys.
- Periodically smoke-test the running `next dev` app (the prod-build e2e is blind to dev breakage).
- Re-`pnpm install` after merging dependency-adding PRs before any local dev run.

---

## Phase 1 — IN FLIGHT (wave 10)
Mobile Project 50 (#86/#87/#104/#105) · Stripe+entitlements (#70/#71) · legal drafts (#78/#79/#83) · staging IaC+pooling (#22/#18) · email reminders (#121).

## Phase 2 — Web monetization UI + mobile core parity
- Paywall UI + upgrade flow (#72), free trial handling (#73), billing portal (#74), dunning (#75), receipts/refunds (#76), Stripe Tax (#77), cookie consent (#80), GDPR data export self-serve (#81), business-entity doc (#82).
- Mobile (Expo, cross-platform → closes the iOS+Android pair each): custom plans (#88/#106), social feed + cheering (#89/#107), recap + photo capture/upload (#90/#108), design polish (#94/#112), native auth parity/session (#84/#102), OAuth deep-link/App-Links (#85/#103).

## Phase 3 — Platform services (env-gated code + config)
- Mobile: push notifications (#91 APNs / #109 FCM via expo-notifications, env-gated), offline + sync (#92/#110), crash reporting (#96/#114 via Sentry RN), in-app purchases (#93 StoreKit / #111 Play Billing, config+code), accessibility (#97/#115).
- Notifications: cross-platform reminder service (#120), preferences + quiet hours (#122), streak-at-risk nudges (#123).
- Analytics: event instrumentation (#124), funnel/retention dashboards config (#125), A/B + feature-flag framework (#126).
- Growth: referral program (#127), install attribution (#128).

## Phase 4 — Infra, observability, performance (config + docs + code)
- Object storage IaC (#19), automated backups + tested-restore scripts (#23), custom domain/DNS/TLS docs (#24), metrics + dashboards (#27), uptime monitoring + alerting config (#28).
- Caching layer for hot reads (#130, code), image optimization + CDN config (#131), public status page (#134).
- CI coverage-gate enforcement (#16 — enable required status checks via `gh api` branch protection).

## Phase 5 — Store readiness + security + remaining
- iOS: app icon/splash/assets (#95), App Store listing (#99), App Privacy labels (#100), TestFlight (#98), review submission (#101).
- Android: icon/splash/assets (#113), Play listing (#117), Data safety form (#118), internal testing (#116), review submission (#119).
- Security/QA: abuse prevention/lockout (#34), third-party pen-test checklist (#35), visual regression tests (#39, Playwright screenshots w/ CI-generated baselines).

---

## Loop termination
After each wave, recompute `open issues` and `open PRs`. When BOTH are 0 → stop and report. Until then, launch the next wave. Store-readiness/credential-only items: deliver the config/asset/doc + mark the human submit/provision step as TODO in the issue, then close (the autonomous deliverable is done).
