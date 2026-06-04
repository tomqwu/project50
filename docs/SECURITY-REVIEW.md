# Pre-launch security review & pen-test preparation

Addresses #35.

This document is a practical, code-grounded security review for Project 50. It lets
the founder self-assess the app before public launch and gives a third-party
penetration-testing firm enough context to scope and execute an engagement.

It is split into four parts:

1. **[Threat model](#1-threat-model)** — what the app does, who the actors are, the
   data it holds, and the trust boundaries.
2. **[Pre-launch checklist](#2-pre-launch-checklist)** — every control, grounded in
   code that EXISTS, with a status and what a reviewer should verify.
3. **[Known gaps / TODOs](#3-known-gaps--todos)** — honest list of what is partial or
   missing, so nothing is discovered the hard way.
4. **[Pen-test engagement plan](#4-pen-test-engagement-plan)** — scope, what to share,
   OWASP Top 10 mapping, and the remediation/retest loop.

Cross-references: [`SECRETS.md`](./SECRETS.md), [`RUNBOOKS.md`](./RUNBOOKS.md),
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md), [`OBJECT-STORAGE.md`](./OBJECT-STORAGE.md).

> Scope note: file/line references point at `apps/web` (the Next.js App Router web
> app + API) and `packages/db` (Prisma schema) as of this branch. Treat them as a
> starting map, not a frozen index.

---

## 1. Threat model

### 1.1 What the app is

Project 50 is a habit-challenge app: a user runs a fixed 7-rule / 50-day program (or a
custom plan), logs daily activity with photos/video, and optionally shares progress
with a social graph (follow / feed / reactions). Paid tiers are handled via Stripe.
There is a Next.js web app and an Expo mobile app that talks to the same API.

### 1.2 Actors

| Actor | Trust | Notes |
| --- | --- | --- |
| Anonymous visitor | Untrusted | Can hit public marketing pages, the sign-in page, and PUBLIC share routes (`/c/[shareId]`). |
| Authenticated user | Semi-trusted | Owns their own content; can follow others, react, block, report. Identified by a NextAuth JWT (web cookie) or a minted Bearer JWT (mobile). |
| Admin | Trusted (internal) | `User.isAdmin` flag gates moderation/admin surfaces. |
| Stripe | Trusted (verified) | Authenticates to `/api/billing/webhook` by signature, not session. |
| Cron caller (Vercel/CI) | Trusted (shared secret) | Authenticates to `/api/cron/*` with `Authorization: Bearer ${CRON_SECRET}`. |
| OAuth IdP (Google / Facebook) | Trusted (external) | Asserts user identity during sign-in. |
| Object store (S3/MinIO) | Trusted (credentialed) | Holds all user media; accessed by the app via presigned URLs. |

### 1.3 Authentication

- **Strategy:** Auth.js / NextAuth v5 with **JWT sessions** (no DB session table).
  `apps/web/auth.ts` sets `session.strategy = "jwt"`, `maxAge = 30 days`
  (`SESSION_MAX_AGE_SECONDS`), rolled forward at most once/day (`SESSION_UPDATE_AGE_SECONDS`)
  — see `apps/web/lib/auth-config.ts`.
- **Providers:** Google and Facebook OAuth. Client IDs/secrets come from
  `GOOGLE_CLIENT_*` / `FACEBOOK_CLIENT_*` env (`apps/web/auth.ts`). There is **no
  password auth** — no credential store to breach, no password reset flow to abuse.
- **Secret handling:** `AUTH_SECRET` signs/verifies the JWT. It is parsed by
  `parseAuthSecrets` to support **comma-separated rotation** (first secret signs, all
  listed secrets verify) for zero-downtime rotation. See `SECRETS.md` →
  "`AUTH_SECRET` zero-downtime rotation".
- **Secure cookies:** `shouldUseSecureCookies` forces `Secure` cookies only when
  `AUTH_URL`/`NEXTAUTH_URL` is `https://` (so the http e2e server still works). In
  production over HTTPS this is on.
- **Mobile session:** the mobile app authenticates via
  `POST /api/mobile/auth/[provider]` (Facebook only today), which exchanges an OAuth
  `code` server-side, resolves/creates the user, and mints a session JWT the client
  returns as `Authorization: Bearer`. `requireUser` (`apps/web/lib/session.ts`) accepts
  either the cookie session or that Bearer token; the cookie path takes precedence.
- **The double-gated e2e provider (prod-disabled — CONFIRMED):** `apps/web/auth.ts`
  adds a `Credentials` provider with `id: "e2e"` for deterministic test sign-in. It is
  **double-gated**:
  - Gate 1: `AUTH_E2E === "1"` — never set in production; only in local `.env` and the
    Playwright `webServer` env.
  - Gate 2: `NODE_ENV !== "production"` — belt-and-suspenders. `next start` forces
    `NODE_ENV=production`, which blocks it. The Playwright e2e server explicitly opts
    back in with `AUTH_E2E_ALLOW_PROD=1`.

  In real production `AUTH_E2E` is unset, so Gate 1 alone blocks the provider; Gate 2
  is moot. A reviewer should confirm `AUTH_E2E` / `AUTH_E2E_ALLOW_PROD` are **absent
  from every production environment** (they are listed under "Test-only flags — NEVER
  set in production" in `SECRETS.md`).

### 1.4 Authorization

- **Per-request user resolution:** every protected route calls `requireUser()`, which
  throws `UnauthorizedError` (→ 401) when neither a session cookie nor a valid Bearer
  token is present.
- **Visibility enforcement:** `getChallenge(id, viewerId)`
  (`apps/web/lib/api/challenges.ts`) enforces three levels server-side:
  - `PRIVATE` → only the owner; otherwise `notFound` (deliberately 404, not 403, to
    avoid confirming existence).
  - `FOLLOWERS` → owner or a confirmed `Follow` edge; otherwise `notFound`.
  - `PUBLIC` → anyone. `getChallengeByShareId` additionally returns `null` unless
    visibility is `PUBLIC`, so share links never leak FOLLOWERS/PRIVATE content.
- **Object ownership:** media object keys are namespaced per user
  (`media/{userId}/{suffix}.{ext}` in `apps/web/lib/storage.ts`), and presigned GET
  URLs are only attached to media the viewer is already authorized to see (via the
  visibility-gated query path).

### 1.5 Data model & sensitive data

From `packages/db/prisma/schema.prisma`:

| Data | Sensitivity | Notes |
| --- | --- | --- |
| `User` (id, handle, displayName, avatarUrl, isAdmin) | Low–moderate PII | **No email/password column** today (see Gaps). OAuth identities are stored as `Identity` rows holding only `provider` + `providerAccountId`. |
| User content (`Challenge`, `Activity`, `DayStatus`, `Milestone`, `Recap`) | Moderate | Personal habit/health-adjacent logs; visibility-gated. |
| Media (`ActivityMedia.objectKey`) | Moderate–high | Photos/video in object storage; reached only via short-lived presigned URLs. |
| Social graph (`Follow`, `Reaction`) | Moderate | Reveals relationships and engagement. |
| Trust & safety (`Block`, `Report`) | Moderate | Safety-critical; mis-enforcement enables harassment. |
| Billing (`Subscription`, `Referral`) | Moderate | No card data stored locally — Stripe is the system of record. |

There is **no plaintext password, no stored card, and no email column** in the DB.
That materially shrinks the blast radius of a database compromise.

### 1.6 Trust boundaries

```
            ┌─────────────────────────────────────────────────────────────┐
            │  Browser / Mobile app (untrusted client)                      │
            └───────┬──────────────────────────────┬───────────────────────┘
                    │ HTTPS (HSTS, CSP, cookies)    │ Bearer JWT (mobile)
   ── boundary 1 ───┼──────────────────────────────┼─────────────────────
                    ▼                              ▼
            ┌─────────────────────────────────────────────────────────────┐
            │  Next.js app + API (middleware → route handlers)             │
            │  requireUser · visibility checks · rate-limit · validation   │
            └───┬─────────────┬─────────────┬──────────────┬───────────────┘
       boundary 2            3              4              5
                │             │             │              │
                ▼             ▼             ▼              ▼
          ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
          │ Postgres │  │ S3/MinIO │  │ Stripe   │  │ Google/FB    │
          │ (Prisma) │  │ presigned│  │ (webhook │  │ OAuth IdPs   │
          │          │  │ URLs     │  │  signed) │  │              │
          └──────────┘  └──────────┘  └──────────┘  └──────────────┘
```

- **Boundary 1 (client ↔ app):** never trust the client. Enforced by `requireUser`,
  server-side visibility checks, and input validation. Transport hardened by HSTS + CSP
  (`apps/web/middleware.ts`).
- **Boundary 2 (app ↔ DB):** all access via Prisma (parameterized — no string-built
  SQL). DB credentials in env only.
- **Boundary 3 (app ↔ object store):** the browser/mobile client never holds S3
  credentials; it gets a short-lived (5 min) presigned URL. Upload type/size are
  validated before a PUT URL is issued.
- **Boundary 4 (app ↔ Stripe):** inbound webhooks are authenticated by signature, not
  session.
- **Boundary 5 (app ↔ OAuth IdP):** identity is asserted by the IdP; the app maps it to
  a local user via `Identity`.

---

## 2. Pre-launch checklist

Status legend: **✅ implemented** · **🟡 partial** · **⬜ TODO**.

### 2.1 Security headers / CSP — ✅ implemented

`apps/web/middleware.ts` sets, on every non-static response: `Content-Security-Policy`,
`Strict-Transport-Security` (2y, includeSubDomains, preload), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (camera/mic/geolocation denied).

- CSP locks down `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`,
  scoped `img/media/connect` (self + the object-store origin + `data:`/`blob:`).
- **Known trade-off:** `script-src`/`style-src` allow `'unsafe-inline'` (documented in
  the file: React inline styles can't be nonced, and static routes have no per-request
  nonce). `'unsafe-eval'` and `ws:` are dev-only, gated on `NODE_ENV`.

**Reviewer should verify:** headers are present on prod responses (not stripped by a
proxy/CDN); CSP has no `'unsafe-eval'` and no `ws:`/`wss:` in production; `frame-ancestors
'none'` + `X-Frame-Options: DENY` both hold; assess residual XSS risk given inline
script/style is allowed.

### 2.2 Rate limiting — 🟡 partial

`apps/web/lib/rate-limit.ts` is a fixed-window limiter; `enforceRateLimit`
(`apps/web/lib/api/http.ts`) throws 429 with `retryAfterSeconds`. Applied to the mobile
auth code-exchange (`10/min`).

- **Limitations (by design, documented):** the store is an **in-memory per-process
  Map** — in a multi-instance deploy the effective limit is `limit × instances` and
  counters reset on cold start. The key is the first `x-forwarded-for` IP (spoofable if
  the edge doesn't normalize XFF). No `Retry-After` response header yet (only JSON
  detail). Coverage is opt-in per route, not global.

**Reviewer should verify:** which routes actually call `enforceRateLimit` (today
primarily mobile auth); whether the edge/CDN sets a trustworthy client IP; recommend a
shared store (Redis INCR+EXPIRE) and broader coverage before launch (see Gaps).

### 2.3 Upload type/size validation — ✅ implemented

`validateUpload` (`apps/web/lib/api/media.ts`) runs **before** a presigned PUT URL is
issued (`apps/web/app/api/uploads/presign/route.ts`): content-type allowlist
(jpeg/png/webp/gif/mp4/webm/quicktime) + per-category size caps (25 MB image / 100 MB
video). The route also requires auth, namespaces the key per user, and sanitizes the
client `suffix` to `[a-zA-Z0-9_-]` (fallback `upload`). Presigned URLs expire in 5 min.

- **Caveat:** validation is on the **declared** content-type/size from the client; the
  presigned PUT pins `ContentType` but the object store does not re-derive the type from
  bytes, and there is **no content moderation** (the file note flags AI moderation as a
  follow-up).

**Reviewer should verify:** a client can't bypass the type pin (e.g. PUT mismatched
bytes); whether served media needs `Content-Type`/`Content-Disposition` hardening to
prevent HTML/SVG being rendered inline from the media origin; confirm presign requires
auth and rejects oversized/disallowed types (it does).

### 2.4 Visibility enforcement (PUBLIC/FOLLOWERS/PRIVATE) — ✅ implemented

See §1.4. Enforced in `getChallenge` and `getChallengeByShareId`, returning 404 (not
403) on denial. Patch validates the visibility enum.

**Reviewer should verify:** every read path that returns challenge/activity/media goes
through the gated query (no ungated `findUnique` leaking PRIVATE content); enumeration of
ids/shareIds yields no info; feed/reactions respect blocks.

### 2.5 Structured logging + redaction — ✅ implemented

`apps/web/lib/logger.ts` emits one JSON line per event, level via `LOG_LEVEL`. A
`SENSITIVE_KEY` regex redacts `password|token|secret|authorization|cookie|set-cookie|
client_secret|access_token|refresh_token` to `[redacted]`. `serializeError` normalizes
thrown values; `handleRoute` logs unhandled route errors.

**Reviewer should verify:** OAuth tokens / Bearer JWTs / Stripe payloads aren't logged
under non-redacted field names; redaction is shallow (top-level keys only) — confirm no
secret is nested inside a logged object; error logs don't leak full request bodies.

### 2.6 Secret handling (rotation, env gating) — ✅ implemented

`AUTH_SECRET` supports comma-separated rotation (`parseAuthSecrets`). Email/Stripe/Sentry
are **opt-in**: absent env → logged no-op (e.g. `isEmailConfigured`, billing 503). Full
inventory, env legend, and rotation runbooks live in `SECRETS.md`.

**Reviewer should verify:** no secret is committed (scan history); prod env has
`AUTH_SECRET`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET` set and `AUTH_E2E*` unset; rotation
procedure matches `SECRETS.md`.

### 2.7 HTTPS / HSTS — ✅ implemented (app) / 🟡 verify at edge

HSTS header is set in middleware (2-year, includeSubDomains, preload). `Secure` cookies
are forced over HTTPS. The app intentionally omits `upgrade-insecure-requests` (so the
local http MinIO works); transport security relies on the host/CDN terminating TLS.

**Reviewer should verify:** TLS is enforced end-to-end at the edge; HTTP→HTTPS redirect
exists; the production object-store origin is HTTPS (the http exception is for local
MinIO only); cert/domain config per `docs/` TLS notes.

### 2.8 Stripe webhook signature verification — ✅ implemented

`/api/billing/webhook` reads the **raw** body (text, not JSON) and passes it with the
`stripe-signature` header to `handleWebhookEvent` (`apps/web/lib/api/billing.ts`), which
calls `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` and
throws `400 invalid_signature` on failure (503 when billing unconfigured).

**Reviewer should verify:** `STRIPE_WEBHOOK_SECRET` is set in prod and matches the live
endpoint; replay/idempotency handling; no business logic runs before signature
verification.

### 2.9 Account deletion + GDPR export — ✅ implemented

- **Deletion:** `DELETE /api/account` → `deleteAccount(uid)`; Prisma relations use
  `onDelete: Cascade` (e.g. `Identity`, `Block`, `Report`), so child rows are removed.
- **Export:** `GET /api/account/export` → `exportAccountData(uid)`, returned as a
  downloadable JSON attachment (`Content-Disposition: attachment`).

**Reviewer should verify:** deletion also removes/orphans object-store media (DB cascade
won't delete S3 objects — confirm a cleanup path or accept retention); export is scoped
to the requesting user only and includes all personal data; both require auth (they call
`requireUser`).

### 2.10 Cron endpoint auth — ✅ implemented

`/api/cron/*` require `Authorization: Bearer ${CRON_SECRET}`; unset secret → 503
(disabled), wrong token → 401.

**Reviewer should verify:** `CRON_SECRET` is set in prod and high-entropy; constant-time
comparison is acceptable for this low-frequency endpoint (currently a `!==` string
compare — note for hardening).

### 2.11 SQL injection — ✅ implemented (ORM)

All DB access is via Prisma with parameterized queries; no raw string-built SQL was
found. **Reviewer should verify** no `$queryRawUnsafe`/string interpolation creeps in.

---

## 3. Known gaps / TODOs

These are acknowledged. Each should be a tracked issue and triaged before public launch.

1. **No `User.email` field — reminders use a placeholder.** The schema has
   `id/handle/displayName` and OAuth `Identity` rows only (no email). The reminder
   service (`apps/web/lib/api/reminders.ts`) documents this and uses a placeholder
   domain `no-email.project50.invalid`; sends stay gated on `isEmailConfigured()`, so
   nothing actually emails real users until `User.email` + opt-out preferences exist.
   *Action:* add `User.email` (+ verification + per-user opt-out) before enabling email.
2. **In-memory rate-limit + cache are per-instance.** Both `lib/rate-limit.ts` and
   `lib/cache.ts` keep state in a module-level Map. In a horizontally scaled deploy
   limits are per-process and caches aren't shared/invalidated globally. *Action:* move
   to Redis (or equivalent) before scaling out; until then document single-instance
   assumption.
3. **Dependency advisories (`pnpm audit`).** `pnpm audit` currently reports **18
   advisories (1 critical, 11 high, 6 moderate)**, all in **transitive dev-tooling /
   mobile build chain**, not the production server runtime:
   - `vitest` (critical — UI server arbitrary file read; only when the Vitest UI is
     running locally), `esbuild` / `vite` (dev-server request/path-traversal),
   - `tar` (multiple, via `expo > @expo/cli` — build-time only),
   - `@xmldom/xmldom` (XML injection — pulled via the mobile/Expo chain),
   - `postcss` (via `next` — build-time CSS), `uuid` (buffer bounds).

   None of these are reachable by an end user of the deployed web API. *Action:*
   triage and bump where a patched version exists (`pnpm audit` → `pnpm up`), document
   any that can't be bumped (transitive, no fixed release), and re-run before launch.
   Do **not** treat the raw count as production-exploitable severity.
4. **Stripe webhook idempotency/replay.** Signature is verified (good) — confirm a
   replayed valid event can't double-apply (e.g. dedupe on event id).
5. **CSRF posture.** Mutating web flows authenticate via the NextAuth session cookie;
   NextAuth uses `SameSite=Lax` cookies plus its own CSRF token on auth routes, and the
   JSON API expects a JSON body (not a form-encoded cross-site POST). There is **no
   custom CSRF token on the app's own JSON mutation routes** — they rely on SameSite +
   JSON content-type. *Action:* have the pen-test explicitly probe state-changing routes
   (follow/block/report/account DELETE, billing portal/checkout) for cross-site forgery;
   add an explicit anti-CSRF check or `Origin`/`Sec-Fetch-Site` assertion if any gap is
   found. The mobile Bearer path is not cookie-based and is not CSRF-exposed.
6. **Object-store media lifecycle on account deletion.** DB cascade does not delete S3
   objects (see §2.9). *Action:* add a deletion/cleanup job or documented retention.
7. **No content moderation on uploads.** Type/size only (§2.3). *Action:* wire
   post-upload moderation before media is shown publicly (flagged in code).
8. **`Retry-After` header + broader rate-limit coverage** (§2.2).
9. **Constant-time secret comparison** for `CRON_SECRET` (§2.10) — low risk, easy win.
10. **e2e provider gating** — confirmed double-gated and prod-disabled (§1.3); keep
    `AUTH_E2E` / `AUTH_E2E_ALLOW_PROD` out of every production environment and verify in
    the pen-test that no `e2e` credentials provider is reachable in prod.

---

## 4. Pen-test engagement plan

### 4.1 Goal

Independent validation that Project 50 can be safely exposed to the public internet:
confirm the controls above hold under adversarial testing and surface anything this
self-assessment missed.

> **TODO (blocking for public launch):** engage a qualified third-party penetration
> testing firm and complete at least one full test + retest cycle before GA. Track as a
> launch-gate issue.

### 4.2 Scope

**In scope**
- Production-equivalent web app + API (`apps/web`) on a staging environment with
  prod-like config (see `INFRA-STAGING.md`).
- Authn/authz: OAuth sign-in (Google/Facebook), session JWT handling, mobile Bearer
  token minting (`/api/mobile/auth/*`).
- Authorization & multi-tenant isolation: challenge visibility (PUBLIC/FOLLOWERS/PRIVATE),
  per-user object isolation, block/report enforcement.
- API routes under `apps/web/app/api/*` (uploads/presign, billing, account, follow,
  block, reports, feed, project50, cron).
- Object-storage access model (presigned URL abuse, key enumeration, type/size bypass).
- Stripe webhook endpoint.
- Security headers / CSP / cookie flags.

**Out of scope (unless separately agreed)**
- Stripe's own infrastructure and Google/Facebook IdPs.
- Underlying cloud host / managed Postgres / object-store provider internals (DoS volume
  testing requires provider sign-off).
- Source-level dev-tooling advisories already triaged in §3.3 (note them, don't
  re-litigate count).

### 4.3 What to share with the firm

- This document, plus `SECRETS.md` (env legend — not the secrets themselves),
  `RUNBOOKS.md`, `INCIDENT-RESPONSE.md`, `OBJECT-STORAGE.md`.
- Architecture summary (§1) and the trust-boundary diagram.
- Test accounts: at least two standard users (to test cross-user isolation) and, on
  request, an admin account; the e2e sign-in provider stays disabled — issue real OAuth
  test logins instead.
- Read access to the API surface map (`apps/web/app/api/*`) and the Prisma schema.
- A staging endpoint, rate-limit allowance for scanning, and a point of contact +
  test window (coordinate with on-call per `INCIDENT-RESPONSE.md` so scan traffic isn't
  mistaken for a real incident).

### 4.4 OWASP Top 10 (2021) mapping

| # | Category | App-specific focus | Primary controls to test |
| --- | --- | --- | --- |
| A01 | Broken Access Control | Cross-user challenge/media access; PRIVATE/FOLLOWERS bypass; IDOR on `/users/[id]/*`, `/challenges/[id]/*`; block/report enforcement; admin gating (`isAdmin`). | `getChallenge` visibility, `requireUser`, per-user object keys. |
| A02 | Cryptographic Failures | Session JWT signing/rotation; cookie `Secure`/`HttpOnly`/`SameSite`; TLS/HSTS at edge. | `auth-config.ts`, middleware HSTS. |
| A03 | Injection | Prisma parameterization; no raw SQL; CSP vs XSS given inline script/style; presigned-URL/key injection. | ORM, CSP, `validateUpload`, suffix sanitization. |
| A04 | Insecure Design | Multi-tenant isolation model; presigned-upload trust model; per-instance rate-limit limits. | §1 trust boundaries, §2.2/§2.3. |
| A05 | Security Misconfiguration | Header presence in prod; CSP `'unsafe-inline'` residual risk; `AUTH_E2E*` absence; verbose errors. | middleware, §3.10. |
| A06 | Vulnerable Components | Confirm runtime deps clean; dev-tooling advisories triaged. | `pnpm audit` (§3.3). |
| A07 | Identification & Auth Failures | OAuth flow integrity; mobile code-exchange (`/api/mobile/auth/*`); session fixation/expiry; rate-limited auth. | `auth.ts`, `mobile-session.ts`, `enforceRateLimit`. |
| A08 | Software & Data Integrity | Stripe webhook signature; no unsigned event processing; supply-chain (lockfile). | billing webhook (§2.8). |
| A09 | Logging & Monitoring Failures | Redaction of secrets/tokens; no PII over-logging; alerting hooks. | `logger.ts`, `OBSERVABILITY.md`. |
| A10 | SSRF | OAuth/Stripe/email outbound calls use fixed endpoints; confirm no user-controlled URL fetch. | `email.ts`, mobile auth Graph calls. |

### 4.5 Remediation & retest process

1. **Report.** Firm delivers findings with severity (CVSS), reproduction, and impact.
2. **Triage.** Founder + (if applicable) on-call rank against launch risk; file an issue
   per finding. Critical/High block launch; Medium/Low get a dated plan.
3. **Remediate.** Fix on a branch with a regression test (the repo's TDD norm), behind
   review.
4. **Retest.** Firm re-verifies fixes (at minimum all Critical/High). Repeat until the
   Critical/High set is closed.
5. **Sign-off.** Record residual accepted risks and an attestation in this doc's history;
   schedule a periodic re-test cadence (e.g. annually and after major auth/billing
   changes).
6. **Incident readiness.** Ensure `INCIDENT-RESPONSE.md` and `RUNBOOKS.md` reflect any
   new monitoring/alerts the engagement recommends.

---

*Living document — update the status columns and Gaps list as controls land. Cross-refs:
[`SECRETS.md`](./SECRETS.md), [`RUNBOOKS.md`](./RUNBOOKS.md),
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md), [`OBJECT-STORAGE.md`](./OBJECT-STORAGE.md).*
