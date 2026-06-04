# Pricing & plans — Free vs Premium (product spike)

A concrete pricing/plans definition for Project 50, grounded in the
monetization and entitlements code that exists in this repo **today**. It is
written so the founder can (a) create the matching Product/Price in Stripe,
(b) set the env vars that wire it up, and (c) turn on feature gating by adding
a known, listed set of `requirePremium` checks when premium launches.

Tracks GitHub issue **#69**. Read alongside
[`docs/BUSINESS-SETUP.md`](./BUSINESS-SETUP.md) (entity / Stripe / tax / legal
runbook) and the billing code (`apps/web/lib/api/billing.ts`,
`apps/web/lib/api/entitlements.ts`).

> **Status: proposal for founder sign-off.** Every feature-tier assignment and
> price point below is a **recommendation with rationale**, not a final
> decision. The amounts are **placeholders** the founder finalizes in Stripe.
> Nothing here changes runtime behavior on its own — see
> [§5 Current state](#5-current-state-everyone-is-free-today).

---

## Contents

1. [What exists today (the ground truth)](#1-what-exists-today-the-ground-truth)
2. [Free vs Premium feature matrix (proposal)](#2-free-vs-premium-feature-matrix-proposal)
3. [Price points (proposal) & how they map to env](#3-price-points-proposal--how-they-map-to-env)
4. [Entitlement enforcement — gates to add at launch](#4-entitlement-enforcement--gates-to-add-at-launch)
5. [Current state: everyone is free today](#5-current-state-everyone-is-free-today)
6. [Competitive context (brief)](#6-competitive-context-brief)
7. [Launch checklist (cross-ref)](#7-launch-checklist-cross-ref)

---

## 1. What exists today (the ground truth)

The monetization stack is built and **env-gated**. With no `STRIPE_SECRET_KEY`
billing is off (endpoints return `503 billing_not_configured`) and **everyone
is "free"** — that is the intended safe default.

**Entitlement model** — `apps/web/lib/api/entitlements.ts`:

- `getEntitlement(uid)` reads the user's single `Subscription` row and returns
  `{ plan: "free" | "premium", isPremium, status, currentPeriodEnd }`.
- A subscription grants premium while its status is `ACTIVE` or `TRIALING`
  (`PREMIUM_STATUSES`); `PAST_DUE` / `CANCELED` / `NONE` / no row → **free**.
- `requirePremium(uid)` is the guard: it throws `403 "premium_required"`
  unless the user is premium. **It is defined but not yet called anywhere** —
  see [§4](#4-entitlement-enforcement--gates-to-add-at-launch) /
  [§5](#5-current-state-everyone-is-free-today).

**Billing backend** — `apps/web/lib/api/billing.ts` + `app/api/billing/*`:

- `createCheckoutSession(uid, priceId, { trialPeriodDays })` →
  `mode: "subscription"` Checkout. `priceId` falls back to **`STRIPE_PRICE_ID`**
  (`app/api/billing/checkout/route.ts`).
- Trial length comes from **`STRIPE_TRIAL_DAYS`**, parsed to a positive integer
  in the `/upgrade` page (`app/(app)/upgrade/page.tsx`,
  `trialDaysFromEnv()`) and passed through as `trial_period_days` →
  Stripe starts the subscription `trialing`.
- Stripe **Billing Portal** (`createPortalSession`, manage/cancel/update card),
  **dunning** (`invoice.payment_failed` → `PAST_DUE` + "update your card"
  email), **receipts** (`invoice.paid` → `ACTIVE` + receipt email), **refunds**
  (`refundCharge` admin helper), and **Stripe Tax** (`automatic_tax` +
  required billing address) all exist. The webhook upserts the `Subscription`
  from `customer.subscription.*` events.
- The `/upgrade` paywall (`app/(app)/upgrade/_components/Paywall.tsx`) already
  renders a Free vs Premium comparison and a "coming soon" disabled state when
  billing is unconfigured. Its hard-coded copy is the starting point this doc
  formalizes.

**Three Stripe env vars are read by code** (see BUSINESS-SETUP §5):
`STRIPE_SECRET_KEY` (master gate), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.
Plus **`STRIPE_TRIAL_DAYS`** (optional, read by the upgrade page).

> **Model implication for the matrix:** entitlement is **binary** today
> (`free` vs `premium`) and a user has **one** `Subscription` row mapped to a
> single Price. So a Monthly Price and an Annual Price are two Prices on the
> **same** premium tier — *not* a third entitlement level. Any "free = N
> plans" limit is a **per-feature count check** the gate enforces; it is not
> represented in the entitlement type. Keep the proposal to a single paid tier
> to match the built model (no multi-tier plumbing exists).

---

## 2. Free vs Premium feature matrix (proposal)

Mapped to **actual** features shipped in the app (routes under
`apps/web/app`). Recommendation rationale: keep the **core habit loop** —
the fixed Project 50 program and a single custom challenge, with daily
check-ins, the private calendar, and basic reminders — **free forever** so the
product is genuinely useful and viral by itself; put the **power-user,
social-reach, and shareable-output** features behind premium, because those are
where ongoing value accrues and where willingness to pay concentrates.

| Feature | Surface (code) | Free | Premium | Rationale |
| --- | --- | --- | --- | --- |
| **Project 50 fixed program** (7 rules / 50 days, start / state / daily toggle, hard-reset) | `app/api/project50/{start,state,toggle}` | ✅ Full | ✅ Full | The signature core loop. Must be free to drive adoption and word-of-mouth. |
| **Custom plans / challenges** | `app/api/challenges` (`createChallenge`, no limit today) | **1 active** custom challenge | **Unlimited** active + custom rule sets | One free custom plan proves value; serious multi-habit users (the payers) need more. |
| **Daily rule check-ins / logging** | `app/(app)/challenges/[id]/log`, `.../activities` | ✅ | ✅ | Core loop — never gate. |
| **Private progress calendar / history** | challenge detail views | ✅ (current run) | ✅ + full historical archive across runs | Current run free; long-term history is a retention/power feature. |
| **Reminders / notifications** | `app/api/notifications/preferences`, `app/api/cron/{reminders,streak-nudges}`, `app/api/push/register` | ✅ Basic daily reminder | ✅ Advanced (streak nudges, custom schedules, multi-channel) | Basic nudge keeps free users succeeding; advanced scheduling is a premium polish. |
| **Recap cards** (shareable image) | `app/api/challenges/[id]/card` | ✅ Standard card | ✅ + premium card styles | Lightweight share asset; keep a basic version free for virality. |
| **Recap video generation** | `app/api/challenges/[id]/recap` | ❌ | ✅ | Compute-heavy, high perceived value, the marquee "wow" reward — strong premium anchor. |
| **Photo uploads** (progress photos) | `app/api/uploads/presign` (storage-backed) | ✅ Limited (e.g. cap N photos / challenge) | ✅ Unlimited | Storage cost scales with usage; a generous free cap, unlimited for premium. |
| **Social feed** (view) | `app/api/feed`, `app/(app)/feed` | ✅ View | ✅ View | Reading the feed should be free — it's the social hook. |
| **Public profile + publishing your challenge** | `app/api/challenges/[id]/publish`, `app/(app)/u/[handle]`, `app/c/[shareId]` | ❌ (private profile only) | ✅ Public profile + publish/share runs | Public reach / vanity profile is a classic premium driver; keeps the free graph clean. |
| **Following / followers** | `app/api/users/[id]/follow` | ✅ Follow (capped, e.g. up to N) | ✅ Unlimited | Light social free; heavy networkers pay. |
| **Reactions** | `app/api/activities/[id]/reactions` | ✅ | ✅ | Cheap engagement — keep free. |
| **Referrals** | `app/api/referral`, `app/(app)/refer` | ✅ | ✅ | Growth lever — never gate (ideally reward with free premium days). |
| **Data export (GDPR / account export)** | `app/api/account/export` | ✅ | ✅ | **Do not gate** — this is a data-rights feature; gating it is a legal/UX risk. |
| **Priority support** | (process, not code) | ❌ Standard | ✅ Priority | Standard premium perk; no engineering needed. |

**Recommended one-line split (matches the built paywall copy):**

- **Free** — Project 50 program + **1** active custom challenge, daily
  check-ins, private calendar (current run), basic reminders, standard recap
  card, capped photos, view feed, light follows, referrals, data export.
- **Premium** — **unlimited** custom challenges, **recap video**, full history,
  advanced reminders/analytics, public profile + publishing, unlimited photos
  & follows, premium recap styles, priority support.

> The current `Paywall.tsx` already advertises premium as "Unlimited
> challenges & custom plans / Public profile & social feed / Recap cards &
> shareable wins / Priority support." This matrix is consistent with that copy
> and makes each item's enforcement point explicit. Note one nuance to align on
> sign-off: the paywall lists "Public profile & social feed" as premium — this
> doc proposes **viewing** the feed stays free (social hook) and only the
> **public/publishing** side is premium. Founder to confirm.

---

## 3. Price points (proposal) & how they map to env

**Placeholders — founder finalizes the actual amounts in Stripe.** The model
is a single premium tier billed monthly **or** annually (annual discounted to
pull users onto the longer commitment), with an optional free trial.

| Plan | Interval | Proposed price (placeholder) | Effective / mo | Notes |
| --- | --- | --- | --- | --- |
| Premium Monthly | month | **$6.99 / mo** | $6.99 | Low-friction entry. |
| Premium Annual | year | **$49.99 / yr** | ~$4.17 | **~40% off** monthly — the headline value; the "best value" default. |
| Free trial | — | **7 days** (recommended) | — | Long enough to finish a meaningful chunk of a 50-day run and feel the recap reward. |

Rationale: $6.99/mo sits in the typical consumer-habit-app band (see
[§6](#6-competitive-context-brief)); a ~40% annual discount is a standard,
healthy incentive that lifts LTV and cuts churn. 7 days is a sensible trial for
a habit product — long enough to build the habit, short enough to convert.

**How these map to the code/env (see BUSINESS-SETUP §5, §7):**

1. In Stripe, create **one Product** ("Project 50 Premium") with **two
   recurring Prices**: a monthly Price and an annual Price.
2. **`STRIPE_PRICE_ID`** = the **default** Price the Checkout subscribes to
   when the request body omits a `priceId`
   (`app/api/billing/checkout/route.ts`). Recommendation: set it to the
   **annual** Price (steer to best value), and have the upgrade UI pass the
   **monthly** Price id explicitly in the request body when the user picks
   monthly. (The checkout route already accepts a `priceId` override; the
   `/upgrade` UI does not yet send one — a small follow-up to add the
   monthly/annual toggle.)
3. **`STRIPE_TRIAL_DAYS`** = `7` (or your chosen length). The `/upgrade` page
   reads it via `trialDaysFromEnv()` and passes `trialPeriodDays` to checkout,
   which Stripe applies as `trial_period_days` → subscription starts
   `trialing` → entitlement = premium until the trial ends. Unset / `0` /
   non-integer ⇒ **no trial** (billing starts immediately).
4. Test-mode and live-mode Price ids differ — set the **live** ids in prod at
   go-live (BUSINESS-SETUP §11).

> The entitlement model does not distinguish monthly vs annual — both Prices
> resolve to the same `premium` entitlement. The chosen Price only affects
> billing cadence and the `Subscription.plan` field (stored from the Price id),
> not what the user can do.

---

## 4. Entitlement enforcement — gates to add at launch

Today nothing is gated (see [§5](#5-current-state-everyone-is-free-today)).
When premium launches, add enforcement using the **existing** helpers:

- Server-route guard: `requirePremium(uid)` (throws `403 "premium_required"`).
- Read-and-branch (for soft limits / partial gating):
  `const { isPremium } = await getEntitlement(uid)`.

Both from `apps/web/lib/api/entitlements.ts`. Recommended call sites, by the
matrix above:

| Gate | Where to add it | Type of check |
| --- | --- | --- |
| Unlimited custom challenges (free = 1 active) | `apps/web/lib/api/challenges.ts` `createChallenge()` (called by `app/api/challenges/route.ts` POST) | `getEntitlement` + count active challenges; if free and ≥1 active, throw `403 premium_required`. **Server-side count check** (binary entitlement can't express the limit). |
| Recap video | `app/api/challenges/[id]/recap/route.ts` | `requirePremium(uid)` at the top of the handler. |
| Public profile / publishing | `app/api/challenges/[id]/publish/route.ts` | `requirePremium(uid)`. |
| Premium recap card styles | `app/api/challenges/[id]/card/route.ts` | `getEntitlement` — branch style by `isPremium` (basic card stays free). |
| Photo upload cap | `app/api/uploads/presign/route.ts` | `getEntitlement` + per-challenge photo count; enforce free cap. |
| Advanced reminders / streak nudges | `app/api/notifications/preferences/route.ts` (and skip premium-only channels in `app/api/cron/{reminders,streak-nudges}`) | `getEntitlement` — branch which schedules/channels are allowed. |
| Full history archive | challenge history read path (server component / loader) | `getEntitlement` — limit free to current run. |
| Unlimited follows | `app/api/users/[id]/follow/route.ts` | `getEntitlement` + follow-count check for free users. |

**Do NOT gate:** `app/api/project50/*` (core program), `app/api/feed` (view),
`app/api/account/export` (data rights), `app/api/referral*` (growth),
`app/api/activities/[id]/reactions` — per the matrix.

**Client/UX:** the `/upgrade` `Paywall` is the conversion surface; on a `403
premium_required` from any gated route, route the user to `/upgrade`. Keep the
free/premium feature lists in `Paywall.tsx` in sync with [§2](#2-free-vs-premium-feature-matrix-proposal).

> **Mobile note:** these routes are also called by the mobile app (Bearer
> auth via `requireUser`). The same server-side gates protect both clients.
> Native IAP (App Store / Play) is a separate concern not built here — current
> billing is Stripe web Checkout; mobile would link out or need IAP before a
> paid mobile launch.

---

## 5. Current state: everyone is free today

To be unambiguous for implementation:

- `requirePremium` and `getEntitlement` are implemented and tested, but
  **`requirePremium` is called by zero routes** (verified: no `requirePremium`
  references under `apps/web/app/api`). Every feature route only calls
  `requireUser`.
- With `STRIPE_SECRET_KEY` unset (dev/CI/e2e and any env without keys),
  `isBillingConfigured()` is false, checkout/portal/webhook return `503`, and
  `getEntitlement` returns **free** for everyone (no Subscription rows).
- Therefore **shipping this doc changes nothing at runtime.** Turning premium
  on is two independent moves: (a) configure Stripe + env (BUSINESS-SETUP §4–7),
  and (b) add the gates in [§4](#4-entitlement-enforcement--gates-to-add-at-launch).
  Until both happen, the app is fully free — which is the safe, intended state.

---

## 6. Competitive context (brief)

Consumer habit / streak / self-improvement apps cluster in a recognizable
band, which anchors the [§3](#3-price-points-proposal--how-they-map-to-env)
proposal:

- **Habit trackers** (e.g. Streaks, Habitica premium, HabitNow,
  Productive) — roughly **$3–$8 / month**, with **annual plans discounted
  ~30–50%** and lifetime options common. Free tiers usually cap the number of
  habits and lock advanced reminders/stats.
- **Fitness / challenge apps** (e.g. the "75 Hard"-style programs, Strava) —
  **$5–$12 / month**; premium gates analytics, social reach, and
  shareable/segment features while keeping the core tracking free.
- **Pattern:** free tier = core loop + a small quota; premium = remove quotas +
  advanced analytics + social/shareable output. Project 50's split (free core
  program + 1 custom plan; premium = unlimited + recap video + public/social
  reach) fits this pattern. $6.99/mo with a ~40%-off annual is mid-market —
  defensible without being a budget outlier or a premium outlier.

(Figures are directional market context for a placeholder proposal, not a
sourced market study. Validate current competitor pricing before finalizing.)

---

## 7. Launch checklist (cross-ref)

This doc decides **what** is free vs premium and **what it costs**;
[`docs/BUSINESS-SETUP.md`](./BUSINESS-SETUP.md) is the operational runbook for
**legally taking the money**. To launch premium:

- [ ] **Sign off on the matrix** ([§2](#2-free-vs-premium-feature-matrix-proposal))
      and resolve the open question (free feed view vs. paywalled feed).
- [ ] **Sign off on price points** ([§3](#3-price-points-proposal--how-they-map-to-env)):
      monthly/annual amounts + trial length.
- [ ] **Create the Product + two Prices** in Stripe — BUSINESS-SETUP
      [§7](./BUSINESS-SETUP.md#7-pricing--product-setup-in-stripe).
- [ ] **Set env:** `STRIPE_PRICE_ID` (default = annual), `STRIPE_TRIAL_DAYS`,
      plus `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` —
      BUSINESS-SETUP [§5](./BUSINESS-SETUP.md#5-connect-stripe-to-the-app-env-vars).
      (Optional UI follow-up: add a monthly/annual toggle that passes the
      monthly `priceId` in the checkout request body.)
- [ ] **Add the entitlement gates** in [§4](#4-entitlement-enforcement--gates-to-add-at-launch)
      (`requirePremium` / `getEntitlement` call sites) and route `403
      premium_required` to `/upgrade`.
- [ ] **Stripe Tax** enabled + registrations — BUSINESS-SETUP
      [§6](./BUSINESS-SETUP.md#6-sales-tax--vat-stripe-tax--77).
      (`automatic_tax` is already wired in `createCheckoutSession`.)
- [ ] **Legal:** fill ToS §5 Payments (plans/prices/renewal/refunds/tax) with
      the figures from this doc — BUSINESS-SETUP
      [§8](./BUSINESS-SETUP.md#8-legal-docs-to-finalize-before-charging).
- [ ] **Refund policy** decided + published — BUSINESS-SETUP
      [§9](./BUSINESS-SETUP.md#9-refund--chargeback-policy).
- [ ] **Go-live gate** — every box in BUSINESS-SETUP
      [§11](./BUSINESS-SETUP.md#11-go-live-checklist) checked (live keys, live
      Price ids, end-to-end test purchase).

---

*Code references: `apps/web/lib/api/entitlements.ts`,
`apps/web/lib/api/billing.ts`, `apps/web/app/api/billing/*`,
`apps/web/app/(app)/upgrade/*`. Cross-refs: `docs/BUSINESS-SETUP.md`.*
