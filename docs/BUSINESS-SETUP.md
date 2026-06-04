# Business entity, bank & payments setup

A practical, ordered runbook for standing up the **business and payments**
side of Project 50 so the product can legally take money. It is grounded in
the code that exists in this repo today — the payment integration is
**Stripe subscriptions** (`apps/web/lib/api/billing.ts`, env-gated on
`STRIPE_SECRET_KEY`), and the app collects user data, so privacy/legal
templates already exist as drafts under [`docs/legal/`](./legal/).

Read alongside [`docs/SECRETS.md`](./SECRETS.md) (where each secret lives and
how it's rotated) and [`docs/DEPLOY.md`](./DEPLOY.md) (CD pipeline /
environments).

> **Not legal, tax, or accounting advice.** This is a founder's operational
> checklist. Entity choice, tax registration, refund obligations, and the
> consumer-protection rules that apply to you depend on **where you and your
> users are**. Have the relevant items reviewed by a licensed attorney and a
> tax/accounting professional before you rely on them or take live payments.
> Every step that needs *your* action, accounts, or a decision is marked
> **TODO** with what's required.

Tracks GitHub issue **#82** (entity registered; Stripe account verified;
payout bank connected; basic accounting). Sales-tax automation is **#77**
(cross-referenced in [§6](#6-sales-tax--vat-stripe-tax--77)).

---

## How to use this runbook

The steps are ordered by dependency — each generally needs the previous one
done first:

1. [Choose & register a legal entity](#1-choose--register-a-legal-entity)
2. [EIN / tax registration](#2-ein--tax-registration)
3. [Business bank account](#3-business-bank-account)
4. [Stripe account setup & verification](#4-stripe-account-setup--verification)
5. [Connect Stripe to the app (env vars)](#5-connect-stripe-to-the-app-env-vars)
6. [Sales tax / VAT (Stripe Tax) — #77](#6-sales-tax--vat-stripe-tax--77)
7. [Pricing & product setup in Stripe](#7-pricing--product-setup-in-stripe)
8. [Legal docs to finalize before charging](#8-legal-docs-to-finalize-before-charging)
9. [Refund & chargeback policy](#9-refund--chargeback-policy)
10. [Basic accounting / bookkeeping](#10-basic-accounting--bookkeeping)
11. [Go-live checklist](#11-go-live-checklist)

A box like `- [ ]` is a task to complete. **TODO** calls out a founder
decision or an account/credential only you can create.

---

## 1. Choose & register a legal entity

You need a legal entity before you can get an EIN, open a business bank
account, or complete Stripe's business verification.

- [ ] **TODO (decide): pick an entity type.** Common options for a US
  software startup:
  - **LLC** — simplest, pass-through taxation, low overhead. Good default
    for a solo founder / small team not yet raising venture capital.
  - **C-Corp (e.g. Delaware Inc.)** — expected by most VCs and the standard
    if you plan to raise priced rounds or issue stock options. More overhead
    (franchise tax, board formalities, separate corporate return).
  - **Sole proprietorship / individual** — no entity at all. Stripe and the
    legal templates support this, but it gives you **no liability shield** —
    not recommended once you take real revenue. Listed only for completeness.
  - *Non-US founder:* use your local equivalent (Ltd, GmbH, etc.) — the rest
    of this runbook still applies; substitute your registry and tax authority.
- [ ] **TODO (decide): home jurisdiction.** US default is your home state for
  an LLC, or **Delaware** for a C-Corp. Register as a *foreign entity* in any
  other state where you have a physical/employee nexus.
- [ ] **TODO (account): register the entity.** File formation documents with
  the state (directly, or via a formation service / registered agent).
  - Captures: entity legal name, registered agent, members/officers.
- [ ] **TODO (record): set the canonical legal name.** Once filed, this exact
  string is the placeholder filled into the legal docs (see [§8](#8-legal-docs-to-finalize-before-charging))
  and into Stripe's business profile. Keep it consistent everywhere.
- [ ] **TODO (decide): operating agreement / bylaws.** Even solo, an operating
  agreement (LLC) or bylaws + initial board consent (Corp) is worth having.

> **Placeholder used elsewhere:** the legal templates contain
> `TODO (insert your legal entity name)`. After this step, that value is the
> name you registered here.

---

## 2. EIN / tax registration

- [ ] **TODO (account): get a US federal EIN** (Employer Identification
  Number) from the IRS. It is **free** and usually issued instantly online to
  applicants with a US SSN/ITIN; otherwise file Form SS-4.
  - The EIN is required to open a business bank account and to complete
    Stripe verification.
- [ ] **TODO (account): state tax registration.** Register with your state's
  tax/revenue department if required (income/franchise tax, and — separately —
  a **sales-tax permit** where you have nexus; see [§6](#6-sales-tax--vat-stripe-tax--77)).
- [ ] **TODO (decide): tax classification.** Confirm with an accountant how
  the entity is taxed (e.g. LLC default pass-through vs. S-corp election).
- [ ] *Non-US:* register for your local business tax number / VAT ID as
  required by your jurisdiction and turnover thresholds.

---

## 3. Business bank account

Stripe pays out to a bank account in the **entity's** name. Do **not** route
business revenue through a personal account — it breaks the liability shield
and complicates bookkeeping.

- [ ] **TODO (account): open a business bank account** in the registered
  entity's legal name. Banks typically require: formation documents, EIN
  confirmation letter, and owner ID.
- [ ] **TODO (record): capture payout details.** Account + routing number (or
  IBAN) — you'll enter these into Stripe in [§4](#4-stripe-account-setup--verification).
- [ ] **TODO (decide): a business credit/debit card** for SaaS expenses
  (hosting, Stripe fees, domains). Keeps personal and business spend separate.

---

## 4. Stripe account setup & verification

Stripe is the payment processor wired into the code today. The backend lives
in `apps/web/lib/api/billing.ts` and the routes `apps/web/app/api/billing/checkout`
and `.../webhook`. It is **opt-in / env-gated**: with no `STRIPE_SECRET_KEY`,
the billing endpoints return `503 billing_not_configured` and no Stripe
client is ever constructed — so dev/CI/e2e run without any Stripe keys.

- [ ] **TODO (account): create a Stripe account** at stripe.com using a
  business email on the entity's domain.
- [ ] **TODO (account): complete the business profile & identity
  verification** ("activate the account"): legal entity name (must match
  [§1](#1-choose--register-a-legal-entity)), EIN, business address, owner/
  representative identity, and industry (MCC).
- [ ] **TODO (account): connect the payout bank account** from [§3](#3-business-bank-account)
  and verify it (micro-deposits or instant verification).
- [ ] **TODO (decide): statement descriptor & support details.** What appears
  on customers' card statements, plus a support email/phone — reduces
  "I don't recognize this charge" chargebacks.
- [ ] **TODO (account): enable Radar / fraud rules** (on by default) and
  review the risk settings.
- [ ] **TODO (decide): test mode first.** Do all of [§5](#5-connect-stripe-to-the-app-env-vars)
  and [§7](#7-pricing--product-setup-in-stripe) in **Stripe test mode** first,
  then repeat the product/price/webhook setup in **live mode** at go-live —
  test-mode and live-mode objects (keys, prices, webhooks) are separate.

---

## 5. Connect Stripe to the app (env vars)

The code reads exactly three Stripe environment variables. All are
**server-side secrets** (none are `NEXT_PUBLIC_*`). Set them in the secret
store per environment as described in [`docs/SECRETS.md`](./SECRETS.md)
(staging/prod live in the Vercel project env per `DEPLOY.md`).

| Variable | Purpose | Used by | Sensitivity |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe API secret key. Its presence is the **master gate** that turns billing on (`isBillingConfigured()`). | `apps/web/lib/api/billing.ts` (`getStripe()`) | **Highly sensitive** — full account API access. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret to verify `POST /api/billing/webhook` requests came from Stripe. | `handleWebhookEvent()` in `apps/web/lib/api/billing.ts` | **Highly sensitive.** |
| `STRIPE_PRICE_ID` | Default Stripe **Price** id the Checkout session subscribes the user to (request body may override it). | `apps/web/app/api/billing/checkout/route.ts` | Not secret (an identifier), but environment-specific (test vs. live). |

Steps:

- [ ] **TODO (account): copy the secret key.** Stripe Dashboard → Developers →
  API keys → **Secret key**. Use the **test** key first, then swap to the
  **live** key at go-live. Set as `STRIPE_SECRET_KEY`.
- [ ] **TODO (account): create the webhook endpoint.** Stripe Dashboard →
  Developers → Webhooks → add endpoint pointing at
  `https://<your-domain>/api/billing/webhook`. The code currently acts on:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

  (other event types are acknowledged but ignored). Subscribe to at least
  those three. Copy the endpoint's **signing secret** into
  `STRIPE_WEBHOOK_SECRET`.
- [ ] **TODO (account): set `STRIPE_PRICE_ID`** to the Price id created in
  [§7](#7-pricing--product-setup-in-stripe).
- [ ] **TODO (config): set `APP_BASE_URL`** to the real `https://` origin in
  staging/prod. The Checkout `success_url` / `cancel_url` are built from it
  (`apps/web/lib/base-url.ts`); it defaults to `http://localhost:3000`, which
  must not be used in production.
- [ ] **Local testing:** use the Stripe CLI to forward webhooks to dev:
  `stripe listen --forward-to localhost:3000/api/billing/webhook`. The CLI
  prints a `whsec_…` signing secret — set that as your local
  `STRIPE_WEBHOOK_SECRET`. Trigger events with `stripe trigger`.
- [ ] **TODO (rotation): add Stripe to the secrets inventory.** `docs/SECRETS.md`
  documents every other live secret but does **not yet list the Stripe vars**.
  Add `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` to its
  inventory with a rotation note (rotate the secret key and roll the webhook
  signing secret on suspicion; both can be rolled in the Stripe Dashboard).

> **Verification gate is real:** if any of these are missing in a given
> environment, billing is simply off there (503), it does not crash the app.
> That's the intended safety behavior — it also means you must double-check
> the **live** values are actually present in prod at go-live.

---

## 6. Sales tax / VAT (Stripe Tax) — #77

Charging tax correctly is a legal obligation once you have nexus, and a
separate work item: **#77 "Sales tax / VAT handling (Stripe Tax)"**
(automatic tax calc by region; tax shown at checkout; reporting export).

> **Code status:** the current Checkout session in `createCheckoutSession()`
> does **not** yet enable `automatic_tax`. Wiring Stripe Tax into the Checkout
> session is part of **#77**; this runbook covers the *account/registration*
> side that must exist regardless.

- [ ] **TODO (account): enable Stripe Tax** in the Stripe Dashboard and set
  your **origin address** and product **tax category**.
- [ ] **TODO (decide): determine your nexus.** Where are you obligated to
  collect — your home state, economic-nexus thresholds in other US states,
  EU/UK VAT (incl. OSS/IOSS for cross-border digital services)? This needs a
  tax professional.
- [ ] **TODO (account): register for sales-tax / VAT** in each jurisdiction
  where you have an obligation, **before** collecting tax there.
- [ ] **TODO (engineering, #77): enable `automatic_tax` on the Checkout
  session** so tax is computed and shown at checkout, and add the reporting
  export. Cross-reference this runbook from that issue.
- [ ] **TODO (process): file & remit** collected tax on the required cadence
  (Stripe Tax reporting helps, but filing is on you / your accountant).

---

## 7. Pricing & product setup in Stripe

The app subscribes users to a Stripe **Price** (`mode: "subscription"`). You
must create the Product + Price in Stripe and put the Price id in
`STRIPE_PRICE_ID`.

- [ ] **TODO (decide): pricing model.** What is the paid plan and its price?
  (The product direction is a fixed 7-rule / 50-day program plus custom plans
  — decide what is free vs. paid, and whether you offer monthly/annual.) Note
  the Checkout code uses `mode: "subscription"`, so the Price must be a
  **recurring** price.
- [ ] **TODO (account): create the Product** in Stripe Dashboard → Product
  catalog (name, description, optionally an image shown on Checkout).
- [ ] **TODO (account): create a recurring Price** under that Product (amount,
  currency, billing interval). Copy its **Price id** (`price_…`).
- [ ] **TODO (config): set `STRIPE_PRICE_ID`** to that id (see [§5](#5-connect-stripe-to-the-app-env-vars)).
  Remember test-mode and live-mode have **different** price ids.
- [ ] **TODO (decide): trials / dunning (optional).** Free trials (#73),
  dunning/retries for failed payments (#75), and a billing portal (#74) are
  separate backlog items — configure trial/retry behavior in Stripe if you
  want it at launch.
- [ ] **Sanity check:** a Checkout session created with this Price should map
  cleanly to a `Subscription` row. The webhook reads `userId` from
  subscription metadata (set by the checkout flow) and persists `plan`,
  `status`, `currentPeriodEnd`, `stripeCustomerId`, `stripeSubscriptionId`.

---

## 8. Legal docs to finalize before charging

The repo ships **draft** legal templates, each headed
"⚠️ DRAFT — requires review by qualified legal counsel before use." Finalize
them before taking live payments:

| Document | Path | Before charging |
| --- | --- | --- |
| Terms of Service | [`docs/legal/TERMS-OF-SERVICE.md`](./legal/TERMS-OF-SERVICE.md) | Fill **§5 Payments & subscriptions**: actual plans/prices (5.1), renewal cadence & how to cancel (5.3), refund policy (5.4 — see [§9](#9-refund--chargeback-policy)), tax handling (5.5). |
| Privacy Policy | [`docs/legal/PRIVACY-POLICY.md`](./legal/PRIVACY-POLICY.md) | Confirm Stripe is listed as a **subprocessor** and the data shared with it (the app intentionally does not store full card numbers — Stripe handles them). |
| Data Processing Addendum | [`docs/legal/DPA.md`](./legal/DPA.md) | Confirm party roles and that Stripe is in the subprocessor annex. |

- [ ] **TODO (record): fill the entity-name placeholders.** Every template has
  `TODO (insert your legal entity name)` — replace with the name from
  [§1](#1-choose--register-a-legal-entity).
- [ ] **TODO (record): set effective dates** (`TODO (insert go-live date)`).
- [ ] **TODO (legal): attorney review.** Have counsel review the finalized
  ToS/Privacy/DPA, especially payment, refund, auto-renewal, and tax terms,
  for the jurisdictions your users are in.
- [ ] **TODO (engineering): fix a stale note in the ToS.** ToS §5.2 still says
  Stripe is *"referenced in the product roadmap but not yet integrated in the
  codebase."* Stripe **is** now integrated (the billing backend landed in
  #204). Update that TODO when finalizing the ToS.
- [ ] **TODO (decide): link Stripe's terms** and confirm Stripe as processor
  at launch (ToS §5.2 TODO).
- [ ] **TODO (product): surface consent at checkout.** Ensure the user accepts
  the ToS/Privacy before paying.

---

## 9. Refund & chargeback policy

Define this before launch — it fills ToS §5.4 and shapes how you handle
disputes in Stripe. (Receipts/refunds tooling is backlog item **#76**.)

**Refunds**

- [ ] **TODO (decide): refund policy.** State the window and conditions (e.g.
  "X-day money-back," or "no refunds except where required by law"). Put it in
  ToS §5.4 and somewhere the customer sees pre-purchase.
- [ ] **TODO (legal): honor statutory rights.** Some jurisdictions grant
  non-waivable rights — e.g. the **EU/UK 14-day right of withdrawal** for
  consumers (note: it can be waived for digital content that begins
  immediately *with the consumer's express consent*). Confirm with counsel
  what applies to your users.
- [ ] **TODO (process): how refunds are issued.** Refunds are processed in the
  Stripe Dashboard (full or partial). Define who can issue them and when. A
  refund that ends/cancels a subscription will fire
  `customer.subscription.deleted`, which the webhook maps to `CANCELED`.

**Chargebacks / disputes**

- [ ] **TODO (process): dispute response.** Decide who monitors Stripe
  dispute notifications and gathers evidence within Stripe's response window.
- [ ] **TODO (decide): prevention.** A clear statement descriptor (§4),
  accessible support contact, and a visible cancellation path reduce disputes.
  Keep an eye on Stripe's dispute-rate thresholds — excessive chargebacks risk
  account suspension.
- [ ] *Optional:* enable **Stripe Radar** rules / chargeback protection
  products if your risk profile warrants it.

---

## 10. Basic accounting / bookkeeping

Issue #82's AC includes "basic accounting."

- [ ] **TODO (decide): bookkeeping system** (e.g. accounting software) tied to
  the business bank account from [§3](#3-business-bank-account).
- [ ] **TODO (process): reconcile Stripe payouts.** Stripe deposits net of
  fees; record gross revenue, Stripe fees, refunds, and taxes collected
  separately. Stripe's reporting / payout reconciliation export feeds this.
- [ ] **TODO (decide): engage an accountant** for entity tax filing and
  sales-tax/VAT remittance ([§6](#6-sales-tax--vat-stripe-tax--77)).
- [ ] **TODO (process): retain records** — invoices, payout reports, and tax
  filings — per your jurisdiction's retention rules.

---

## 11. Go-live checklist

Final gate before flipping billing on in **production**. Do not enable live
payments until every box is checked.

**Entity & money**
- [ ] Legal entity registered; canonical legal name recorded ([§1](#1-choose--register-a-legal-entity)).
- [ ] EIN issued; required tax registrations done ([§2](#2-ein--tax-registration)).
- [ ] Business bank account open in the entity name ([§3](#3-business-bank-account)).

**Stripe (live mode)**
- [ ] Stripe account activated / identity verified; payout bank connected and verified ([§4](#4-stripe-account-setup--verification)).
- [ ] Statement descriptor + support contact set ([§4](#4-stripe-account-setup--verification)).
- [ ] Product + recurring Price created in **live** mode ([§7](#7-pricing--product-setup-in-stripe)).
- [ ] **Live** `STRIPE_SECRET_KEY` set in the prod secret store ([§5](#5-connect-stripe-to-the-app-env-vars)).
- [ ] **Live** webhook endpoint created at `/api/billing/webhook` (subscribed to the three `customer.subscription.*` events) and `STRIPE_WEBHOOK_SECRET` set ([§5](#5-connect-stripe-to-the-app-env-vars)).
- [ ] **Live** `STRIPE_PRICE_ID` set to the live Price id ([§5](#5-connect-stripe-to-the-app-env-vars), [§7](#7-pricing--product-setup-in-stripe)).
- [ ] `APP_BASE_URL` set to the real `https://` prod origin ([§5](#5-connect-stripe-to-the-app-env-vars)).
- [ ] End-to-end test purchase in live mode → `Subscription` row created with `ACTIVE` status; cancel → row flips to `CANCELED`.

**Tax**
- [ ] Stripe Tax enabled, nexus determined, registrations in place; `automatic_tax` wired (#77) ([§6](#6-sales-tax--vat-stripe-tax--77)).

**Legal**
- [ ] ToS/Privacy/DPA finalized (entity name + dates filled), payment/refund/tax terms completed, attorney-reviewed; stale ToS §5.2 note fixed ([§8](#8-legal-docs-to-finalize-before-charging)).
- [ ] Refund & chargeback policy decided and published ([§9](#9-refund--chargeback-policy)).
- [ ] ToS/Privacy consent surfaced at checkout ([§8](#8-legal-docs-to-finalize-before-charging)).

**Ops**
- [ ] Stripe vars added to [`docs/SECRETS.md`](./SECRETS.md) inventory with rotation notes ([§5](#5-connect-stripe-to-the-app-env-vars)).
- [ ] Bookkeeping in place; payout reconciliation process defined ([§10](#10-basic-accounting--bookkeeping)).
- [ ] Owner assigned for Stripe dispute/chargeback notifications ([§9](#9-refund--chargeback-policy)).
