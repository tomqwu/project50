# Production Readiness — Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Merge gate (every code task):** unit tests → e2e → `/codex:review` (fix blockers before commit) → CI green. Use the HashiCorp Terraform skills for `infra/azure/**`.

**Goal:** Take the already-built, dev-deployed Project 50 web app (live at `https://www.project50.fit` on Azure Container Apps) to genuine production quality and a public GA: close the security findings from this session, complete authentication, wire the deliberately-deferred integrations (observability, billing, email), promote to a hardened prod environment, and prepare native store submission.

**Architecture:** The feature backlog is 100% built (issues = 0). This plan is **hardening + configuration + go-live**, not new features. Web is the reference implementation; everything ships behind the existing env-gating so unconfigured = no-op. Infra is Terraform on the cloud landing zone; deploys are local-after-tagged-release.

**Tech Stack:** Next.js 15 (App Router), Prisma/Postgres, Auth.js v5, Azure Container Apps + Blob + Postgres Flexible, Terraform (azurerm), Expo RN, Sentry/Stripe/Resend (env-gated), GitHub Actions.

**Status entering this plan (live):** `www.project50.fit` serves HTTPS; Facebook OAuth works (real App ID + www callback); Postgres least-priv role; Blob via managed identity. **In-flight PRs in the codex gate:** #255 legal pages, #256 OG images, #258 media-deletion-on-account-delete.

---

## Scope note (decomposition)

This covers multiple subsystems. Phases 4 (Monetization go-live) and 6 (Mobile store submission) are large enough to warrant their **own** detailed plans when reached — they depend on external accounts (Stripe, Apple, Google Play) and human review cycles. This document details **Phase 1** (immediately actionable code/infra closeout) task-by-task and gives structured task lists for Phases 2–7.

---

## Phase 1 — Close-out: land in-flight work + this session's security findings

### Task 1.1: Land the three in-flight PRs through the gate

**Files:** (no new code) PRs #255, #256, #258.

- [ ] **Step 1:** For each PR, run `/codex:review --base main` from its branch worktree; if findings, SendMessage the agent to fix, re-review until clean.
- [ ] **Step 2:** Update each branch against `main` (`git merge origin/main`) so the strict gate is satisfied; wait for CI `gh run view --json conclusion` == success.
- [ ] **Step 3:** `gh pr merge <n> --squash --delete-branch` only when codex-clean AND CI-green. Order: #258 (blob-cleanup) → rebase #255 (legal) onto it → #255 → #256.
- [ ] **Step 4:** Verify the release workflow auto-cut a CalVer tag per merge (`gh release list`).

### Task 1.2: Azure Blob CORS (Codex upload-path finding #3)

**Files:** Modify `infra/azure/main.tf` (add `azurerm_storage_account` `blob_properties.cors_rule`); Test: `terraform validate` + manual browser PUT.

- [ ] **Step 1 (HashiCorp TF skill):** Add a `blob_properties { cors_rule { ... } }` block to `azurerm_storage_account.media`: `allowed_origins = ["https://www.project50.fit"]`, `allowed_methods = ["GET","PUT","HEAD","OPTIONS"]`, `allowed_headers = ["content-type","x-ms-blob-type"]`, `exposed_headers = ["etag"]`, `max_age_in_seconds = 3600`.
- [ ] **Step 2:** `cd infra/azure && terraform fmt && terraform validate` → Success.
- [ ] **Step 3:** `/codex:review` the diff; commit `feat(infra): Blob CORS for browser uploads`; PR → CI → merge.
- [ ] **Step 4:** `terraform apply -var image_tag=<current> -var app_db_password=$(cat /tmp/p50app_pw) -var auth_url=https://www.project50.fit`.
- [ ] **Step 5 (verify):** Sign in on `www.project50.fit`, attach a check-in photo, confirm the browser PUT to `*.blob.core.windows.net` succeeds (no CORS error in console) and the thumbnail renders.

### Task 1.3: Remove DB/Auth secret VALUES from Terraform state (Codex finding #4)

**Files:** Modify `infra/azure/main.tf`, `infra/azure/README.md`.

- [ ] **Step 1 (HashiCorp TF skill):** Stop managing `database-url`, `database-url-admin`, `auth-secret` secret *values* in TF. Replace the `azurerm_key_vault_secret` resources with **out-of-band** creation (document `az keyvault secret set` in the runbook) and have the Container App reference them by **versionless URI** (`${module.onboard.key_vault_uri}secrets/<name>`), exactly like the `facebook-client-*` secrets already do.
- [ ] **Step 2:** `terraform state rm` the three `azurerm_key_vault_secret` resources (values stay in KV; TF stops tracking them). `terraform plan` → confirm `0 to destroy` of the actual secrets, Container App unchanged.
- [ ] **Step 3:** Add a runbook step: rotate (re-`az keyvault secret set`) `auth-secret` and the DB passwords once, then scrub old TF state versions per `docs/SECRETS.md`.
- [ ] **Step 4:** `/codex:review`; commit; PR → CI → merge → `apply`. Verify `/api/ready` still `{database:true,storage:true}` and a login round-trips (AUTH_SECRET intact).

### Task 1.4: Bring the custom-domain binding into Terraform (remove imperative `az` drift)

**Files:** Modify `infra/azure/main.tf` (Container App `ingress.custom_domain` + reference the managed cert).

- [ ] **Step 1 (HashiCorp TF skill):** Add `ingress { custom_domain { name = "www.project50.fit", certificate_binding_type = "SniEnabled", certificate_id = <managed cert id> } }` to `azurerm_container_app.web`. Import the existing binding/cert (`terraform import`) so `plan` shows `No changes`.
- [ ] **Step 2:** Capture the three managed-cert tag-policy exemptions (created imperatively this session) as `azurerm_resource_policy_exemption` resources + `terraform import` them.
- [ ] **Step 3:** `terraform validate`; `/codex:review`; commit; PR → CI → merge. `plan` converges to `No changes`.

### Task 1.5: `AUTH_URL=https://www.project50.fit` as the committed TF default + apex→www redirect

**Files:** Modify `infra/azure/variables.tf`; (manual) Namecheap URL redirect.

- [ ] **Step 1:** Change `variable "auth_url"` default from `https://project50.fit` to `https://www.project50.fit`. `/codex:review`; commit; PR → CI → merge (so re-applies without `-var` stay correct).
- [ ] **Step 2 (human):** In Namecheap, replace the apex `CNAME @` + the old `asuid`/apex records with a **URL Redirect `@` → `https://www.project50.fit`** so `project50.fit` redirects to www. Delete the dead apex `asuid` TXT.
- [ ] **Step 3 (verify):** `curl -sI https://project50.fit` → 301 → `https://www.project50.fit`.

### Task 1.6: Rotate the Facebook App Secret (leaked in chat)

**Files:** none (ops).

- [ ] **Step 1 (human):** In the Facebook app → Settings → Basic → regenerate the App Secret.
- [ ] **Step 2:** `! az keyvault secret set --vault-name kv-project50-dev-6z7n --name facebook-client-secret --value "<new>"`.
- [ ] **Step 3:** Force re-resolution: `az containerapp secret set …` + `az containerapp update --revision-suffix fbrot1`. Verify Facebook login still completes.

---

## Phase 2 — Complete authentication (M1 gate)

> Goal: every documented sign-in path works in prod. See `docs/AUTH-PRODUCTION.md`.

- [ ] **Task 2.1 — Google OAuth:** user provides Google Client ID/Secret → `az keyvault secret set google-client-id/secret` → add the two secret refs + `GOOGLE_CLIENT_ID/SECRET` env to the Container App TF (mirror the facebook block) → apply → user registers `https://www.project50.fit/api/auth/callback/google` + JS origin in Google Cloud Console → verify the authorize redirect carries the real client_id (same check used for Facebook).
- [ ] **Task 2.2 — Email magic-link:** user provides `RESEND_API_KEY` + `EMAIL_FROM` (a verified Resend domain) → KV secrets + Container App env → apply → the email provider registers (`isEmailConfigured()`), the sign-in card shows the email option, and a real magic-link email arrives and logs in.
- [ ] **Task 2.3 — Auth hardening review:** confirm `AUTH_E2E`/`AUTH_E2E_ALLOW_PROD` are **never** set in the prod Container App; confirm secure cookies (https); run the `oauth-redirect` e2e against prod expectations.

---

## Phase 3 — Observability, backups, and a hardened PROD environment (M0 completion)

> The code/docs exist (`OBSERVABILITY.md`, `BACKUPS.md`, `INFRA-STAGING.md`, `INCIDENT-RESPONSE.md`); wire them live.

- [ ] **Task 3.1 — Sentry:** create a Sentry project → set `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG/PROJECT/AUTH_TOKEN` for source maps) as Container App env/KV → rebuild image (Sentry plugin activates with a DSN) → apply → trigger a test error and confirm it lands in Sentry.
- [ ] **Task 3.2 — Metrics + dashboards + alerts:** set `METRICS_TOKEN`; wire the LAW (`law-alz-canadacentral`) dashboards + alert rules per `OBSERVABILITY.md` (azurerm_monitor_* in TF): availability (uptime ping on `/api/health`), 5xx rate, p95 latency, Postgres CPU/connections, cert-expiry. Alert action group → email/on-call.
- [ ] **Task 3.3 — Automated backups + tested restore:** the `backup.yml` workflow exists — point it at the prod Postgres (`pg_dump` to Blob, retention), and **run a restore drill** into a throwaway DB to prove it (per `BACKUPS.md`). Add `CRON_SECRET` for the reminder/nudge cron routes.
- [ ] **Task 3.4 — Separate PROD env:** today is one `dev`-tagged env. Stand up a `prod` app-onboard RG (`env="prod"`) + Container App + its own Postgres/Blob, OR formally designate the current env as prod and re-tag. Decide and document in `DEPLOY.md`. Wire the `deploy.yml` CD (currently inert without secrets) OR keep the local-after-release model and document it as policy.
- [ ] **Task 3.5 — Security review:** execute `docs/SECURITY-REVIEW.md` against the live deployment — verify CSP/headers on `www.project50.fit` (`securityheaders.com`), Postgres firewall is Azure-services-only, KV RBAC, no public Blob, Defender free tier. Run the `#35` pen-test checklist.

---

## Phase 4 — Monetization go-live (M2) — *warrants its own detailed plan*

- [ ] Stripe live keys (`STRIPE_SECRET_KEY`, webhook secret, price IDs) → KV/env; configure the webhook endpoint at `https://www.project50.fit/api/...`; Stripe Tax; test a real subscribe → entitlement → dunning → cancel cycle in Stripe test mode first.
- [ ] Legal/business: complete `BUSINESS-SETUP.md` (entity), publish `/privacy` + `/terms` (Phase 1 #255), finalize `PRICING.md`. **Trademark gate:** the deep-research found "75 Hard" is a live Class-009 trademark and "Project 50" collides with an existing App Store app — get an IP-attorney clearance on the public/commercial name before paid launch (rename if advised).

---

## Phase 5 — Performance & scale (M5 partial)

- [ ] Verify the caching layer (`lib/cache.ts`), image optimization + CDN (`CDN.md`) under the prod domain; add a CDN in front of Blob for media if traffic warrants; load-test the Container App scale-to-zero cold-start and tune min-replicas if needed.
- [ ] Wire analytics/funnel dashboards (`ANALYTICS.md`) + feature flags for staged rollout.

---

## Phase 6 — Native store submission (M3/M4) — *warrants its own detailed plan*

- [ ] iOS: real app icon/splash (replace placeholders), App Store listing (`docs/store/`), App Privacy labels, TestFlight, review submission; wire RevenueCat keys for IAP.
- [ ] Android: icon/splash, Play listing, Data safety form, internal testing, review submission; Play Billing keys.
- [ ] Point the mobile app's API client at `https://www.project50.fit`; verify OAuth deep-link/App-Links against the prod domain.

---

## Phase 7 — Growth & support ops (M5)

- [ ] Notifications (push APNs/FCM keys, reminder service live), referral program, install attribution validated; support runbooks (`RUNBOOKS.md`, `INCIDENT-RESPONSE.md`) staffed; a11y/i18n audit.

---

## Self-review

- **Coverage:** Phases map to roadmap M0–M5 + this session's 4 Codex findings (CSP done in #257; CORS 1.2; presign-headers done in #257; secrets-in-state 1.3) + the 5 deploy follow-ups I named (Google, email, AUTH_URL default, FB rotation, custom-domain-in-TF). No known gap.
- **Placeholders:** infra/config tasks reference exact resources, KV names (`kv-project50-dev-6z7n`), and verification commands; the genuinely-external steps (provide Stripe/Google keys, app-store review) are human-gated by nature and labelled as such, not hidden TODOs.
- **Decomposition:** Phases 4 and 6 flagged for their own detailed plans.
