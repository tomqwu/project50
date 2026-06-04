# CLAUDE.md — how we work in this repo

Guidance for AI agents (and humans) working on **Project 50**. These are the
established conventions — follow them exactly; they override default behavior.

---

## What this is

A habit-transformation product built around the **Project 50** program (7 fixed
daily rules, 50 days, all-or-nothing with a hard reset) + custom plans, monetized
by subscription. Web is the reference implementation; iOS/Android mirror it.

**Monorepo (pnpm):**
- `apps/web` — Next.js 15 App Router (vitest, Playwright e2e, **99% coverage gate**)
- `apps/mobile` — Expo RN SDK 52 (jest + RNTL, **99% gate**)
- `packages/{core,db,ui,config}` — shared domain (`@project50/core` date/program helpers), Prisma/Postgres (`@project50/db`), Momentum design system (`@project50/ui`)
- `infra/azure` — Terraform for the Azure deployment (on the cloud landing zone)

**Live:** `https://www.project50.fit` (Azure Container Apps, Canada Central).

---

## ⛔ The merge gate (non-negotiable, every code change)

A code change may only merge after, **in order**:

1. **Unit tests** pass (vitest/jest) at the **99% coverage** gate — TDD, write the failing test first.
2. **e2e** pass (Playwright; CI's `verify` job runs them on a prod build).
3. **`/codex:review`** is run on the diff **before committing**; fix every blocking finding, re-review until clean. Codex is an adversarial second opinion — it routinely finds real bugs; take it seriously.
4. **CI green** — the required checks `verify` + `Mobile (headless Jest — no simulator)` both pass. `main` has branch protection (strict/up-to-date, linear history, enforce_admins) — so update the branch against `main`, confirm `gh run view --json conclusion == success`, then `gh pr merge --squash --delete-branch`.

Never merge a red PR. Never weaken coverage thresholds or add broad istanbul-ignores.

## Subagent-driven, parallel, autonomous

- **Always dispatch worktree-isolated subagents** for substantial implementation; keep your own context for orchestration (open PRs, run the gates, manage merges). Run independent tasks in **parallel waves** — pick disjoint file footprints, ≤1 schema-toucher and ≤1 `package.json`-toucher per wave.
- **Do NOT ask for confirmation / execution choice** — just proceed. Report progress tersely; don't pause to ask "want me to continue?".
- Subagents: TDD, push their branch (no PR). The orchestrator opens the PR, runs `/codex:review`, sends fixes back via SendMessage, and merges when the gate is green.

## Release & versioning

- `.github/workflows/release.yml` auto-cuts a **CalVer** tag `vYYYY.MM.DD.N` + GitHub release on every green merge to `main`. The in-app `ReleaseBadge` (landing page) shows the deployed tag/sha/time.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. PR trailer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Deployment (Azure) — local, gated, IaC

- **Deploys run LOCALLY** from an `az login` runtime, gated on: CI-green + merged to `main` + a release tag cut. **No** GitHub Actions OIDC CD.
- **Build the image in the cloud:** `az acr build --registry acralztyhlgn6o --image project50-web:<sha> --platform linux/amd64 --file apps/web/Dockerfile .` (local `docker build` of the amd64 image fails under arm64 emulation; `az acr build` builds natively). The Dockerfile must stay ACR-compatible (no BuildKit `--mount`).
- **Apply:** `cd infra/azure && terraform apply -var image_tag=<sha> -var app_db_password=<p50app pw> -var auth_url=https://www.project50.fit`. Container Apps caches **versionless** KV secret refs (~30 min) — after changing a secret value, force a new revision (`az containerapp update --revision-suffix ...`) to pick it up immediately.
- **Use the HashiCorp Terraform skills** (`terraform-code-generation`, etc.) for `infra/azure/**`.
- **Secrets never go in TF state:** reference KV secrets by **versionless URI** (set the values out-of-band via `az keyvault secret set`); generated passwords pass via `-var`, not `random_password` resources where avoidable.
- **Env-gated integrations** (Sentry, Stripe, Resend email, Google/Facebook OAuth, metrics, cron): code no-ops without the keys. OAuth/email providers register only when their client-id/key env is set.

**Key facts:** subscription `81e891a1-…` (Azure Sponsorship → budgets disabled, use `scripts/cost-report.sh`); RG `rg-project50-dev-canadacentral`; Key Vault `kv-project50-dev-6z7n`; ACR `acralztyhlgn6o`; the app connects to Postgres as the least-priv `p50app` role (admin creds live only in the `database-url-admin` KV secret, for migrations); Blob via the app's **managed identity** (no account key). Custom-domain: subdomains (`www`) get managed certs cleanly; **apex domains do not** (the HTTP→HTTPS redirect breaks the ACME challenge).

## Verify the running app, not just tests

Green tests ≠ working app. After a user-facing change, run it the way users do (`pnpm dev` AND the live URL) and click the actual control. The prod-build e2e is blind to dev-mode breaks (e.g. CSP needs `'unsafe-eval'` + `ws:` in dev for Fast Refresh). **A stale deployed image is the #1 "it works locally but not online" cause — rebuild + redeploy after merges.**

## Local dev gotchas

- After merging schema-changing PRs: `pnpm install` + `pnpm --filter @project50/db exec prisma generate` (the local Prisma client / `@azure/*` deps go stale).
- Root `.env` `DATABASE_URL` must point at the `project50` dev DB; agents that set up `p50_*` test DBs must NOT clobber it. Keep the dev DB migrated (`prisma migrate deploy`).
- Visual-regression baselines are Linux-rendered — regenerate via the **`Update visual baselines`** workflow (`workflow_dispatch`), never on macOS.
- `.env` is always gitignored; `.claude/` and `infra/azure/tfplan` are gitignored.

## Where things live

- Per-feature implementation plans: `docs/superpowers/plans/`.
- Production-readiness & go-live: `docs/superpowers/plans/2026-06-04-production-readiness.md`.
- Ops/prod docs: `docs/` (DEPLOY, SECRETS, BACKUPS, OBSERVABILITY, SECURITY-REVIEW, OBJECT-STORAGE, DOMAIN-TLS, INCIDENT-RESPONSE, RUNBOOKS, …).
- Roadmap (M0–M5 → commercial GA): `ROADMAP.md`.
