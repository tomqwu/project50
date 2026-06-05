> ⚠️ **DRAFT — requires review by qualified legal counsel before use.**
> This document is a non-binding template prepared from the product's
> current data-handling behaviour (verified against the codebase and
> database schema). It is **not legal advice**. Every item marked `TODO`
> must be completed, and the whole document reviewed and approved by a
> licensed attorney (including a check against GDPR, UK GDPR, CCPA/CPRA,
> and any other laws that apply to your users), before publication.

# Project 50 — Privacy Policy

**Effective date:** TODO _(insert go-live date)_
**Last updated:** TODO

This Privacy Policy explains how TODO _(insert legal entity name)_
("**we**", "**us**", "**our**") collects, uses, and shares personal data
when you use the Project 50 website, mobile apps, and related services
(the "**Service**").

For users in the EU/EEA and UK, the **data controller** is TODO _(insert
controller legal name and address)_. TODO _(if you have an EU/UK
representative or DPO, name them here)._

---

## 1. Data we collect

The descriptions below reflect what the Service actually stores today. We
have grouped them by source.

### 1.1 Account & profile data

When you sign in with **Google** or **Facebook**, we create a profile
that contains:

- **Handle** — a unique username (3–30 characters). It is initially
  derived from the name/email fragment your identity provider returns,
  then made unique; you can change it.
- **Display name** — initially taken from your identity provider; you
  can change it.
- **Avatar image URL** (optional) — the profile-image URL provided by
  your identity provider, if any.
- **Identity link** — the provider (Google or Facebook) plus the
  **provider-specific account identifier** for you. We store this link
  so we can recognise you on return visits.

> **Note on email:** the email address from your identity provider is
> used **transiently** at sign-in (e.g. to help derive an initial
> handle). Based on the current database schema, the email address is
> **not** persisted in our database. TODO _(confirm this remains true at
> launch; if you later store email — e.g. for receipts or notifications
> — update this section)._

### 1.2 Challenge & activity data

- **Challenges** you create: title, goal type, unit, daily target, start
  date, timezone, length, program kind (e.g. Project 50), status, and
  **visibility setting** (Public / Followers / Private).
- **Activity logs** and progress: per-day entries, amounts, completion
  status, optional **notes**, and an optional **mood** value.
- **Daily statuses, milestones, rule checks, and recaps** computed from
  your activity.

### 1.3 Photos & media

- **Photos and other media you upload** with your activity logs, and
  generated **recap** media. These files are stored in our object
  storage; we also store image dimensions and ordering. TODO _(confirm
  whether any image metadata/EXIF is stripped on upload)._

### 1.4 Social graph & interactions

- **Follows** — who you follow and who follows you.
- **Reactions and comments** (cheers and comment text) you make on
  activities.
- **Blocks** — users you have blocked.
- **Reports** — content/users you report (the target and your stated
  reason), used for safety and moderation.

### 1.5 Technical & log data

- **Session/authentication cookies** (see Section 6).
- TODO _(confirm what server/access logs, IP addresses, and device/user-
  agent data your hosting and application logging actually retain, and
  for how long; describe them here)._
- **Error/diagnostic data** — only if error monitoring (**Sentry**) is
  enabled in the deployment. Sentry is **opt-in** and runs only when a
  Sentry DSN is configured. When enabled, diagnostic data (which may
  include limited request context) is sent to Sentry to help us fix
  problems. TODO _(confirm whether Sentry is enabled in production and,
  if so, configure PII scrubbing/`sendDefaultPii` appropriately)._

### 1.6 Payment data (if/when paid plans launch)

If we offer paid plans, payments are processed by **Stripe**. We do
**not** receive or store full card numbers. Stripe provides us limited
billing data (e.g. subscription status, last four digits, billing
country). TODO _(confirm exactly what Stripe data you store once
monetization is live; Stripe is on the roadmap but not yet integrated in
the codebase)._

---

## 2. Why we use your data & legal bases

| Purpose | Data used | Legal basis (GDPR/UK GDPR) |
|---|---|---|
| Create and operate your account | Profile, identity link | Performance of a contract |
| Provide challenges, tracking, recaps | Challenge & activity data, media | Performance of a contract |
| Social features (follows, public profiles, reactions) per your visibility settings | Social graph, content | Performance of a contract; consent for content you choose to make public |
| Safety, moderation, abuse prevention | Reports, blocks, log data | Legitimate interests; legal obligation |
| Security, fraud prevention, rate limiting | Technical/log data | Legitimate interests; legal obligation |
| Debugging & reliability (if Sentry enabled) | Error/diagnostic data | Legitimate interests |
| Payments & billing (if paid plans launch) | Billing data via Stripe | Performance of a contract; legal obligation |
| Communicating with you about the Service | Contact details you provide | Performance of a contract; legitimate interests |

TODO _(confirm legal bases with counsel for your target markets; if you
add marketing or analytics, you will likely need **consent** and a
cookie/consent banner)._

We do **not** sell your personal data. TODO _(confirm; required for
CCPA/CPRA. Also confirm whether any "sharing" for cross-context
advertising occurs — currently none is implemented.)_

---

## 3. How we share data (third parties & subprocessors)

We share personal data only with service providers that help us run the
Service, and as required by law. Current and anticipated providers:

| Provider | Purpose | Notes |
|---|---|---|
| **Google** | OAuth sign-in | Receives sign-in requests; we receive profile basics. |
| **Facebook (Meta)** | OAuth sign-in | Receives sign-in requests; we receive profile basics. |
| **Stripe** | Payment processing (if/when paid plans launch) | Handles card data directly. |
| **Sentry** | Error/diagnostic monitoring (only if enabled) | Opt-in via DSN configuration. |
| **Object-storage provider** (S3-compatible) | Stores uploaded photos and recap media | TODO _(insert actual vendor & region — e.g. AWS S3, Cloudflare R2, self-hosted MinIO)._ |
| **Hosting / application provider** | Runs the app and database | TODO _(insert actual vendor & region)._ |

See **DPA.md** for the full subprocessor table with locations. We will
keep that list current as providers change. TODO _(set up a process to
notify users of new subprocessors where required.)_

---

## 4. International transfers

Your data may be processed in countries other than your own, including
where our providers operate. Where we transfer personal data out of the
EEA/UK, we rely on appropriate safeguards (e.g. the European Commission's
**Standard Contractual Clauses** / the UK **IDTA**) or an adequacy
decision. TODO _(confirm the actual processing locations of your hosting
and storage providers and the transfer mechanism for each.)_

---

## 5. Data retention

We retain personal data for as long as your account is active and as
needed to provide the Service. When you **delete your account** (see
Section 7), we permanently delete your profile and associated data —
including your identity links, challenges, activities, uploaded media,
day statuses, milestones, recaps, rule checks, follows (in both
directions), and reactions — via cascading deletion in our database.

TODO _(confirm and document: (a) the deletion timeline for **object
storage** — i.e. how/when uploaded photos and recap media are purged
from the bucket after account/content deletion; (b) **backup**
retention windows and how deletions propagate to backups; (c) any data
retained for legal, tax, or fraud-prevention reasons, e.g. Stripe
billing records.)_

---

## 6. Cookies & sessions

The Service uses a small number of **strictly necessary** cookies to keep
you signed in and to secure your session. Authentication uses a
JWT-based session cookie with a maximum lifetime of about **30 days**
(refreshed periodically while you are active). On secure (HTTPS)
deployments the session cookie is marked **Secure**.

We do **not** currently use advertising or third-party analytics
cookies. TODO _(if you add analytics/marketing, add a cookie banner and
list those cookies here, with consent where required.)_

---

## 7. Your rights & choices

Depending on where you live, you may have rights to **access**,
**correct**, **delete**, **export (portability)**, **restrict**, or
**object to** the processing of your personal data, and to **withdraw
consent** where processing relies on it.

- **Edit your profile** (handle, display name) in **Settings**.
- **Control visibility** of each challenge (Public / Followers /
  Private).
- **Delete your account** at any time in **Settings → Delete account**.
  This permanently and irreversibly removes your data as described in
  Section 5.
- **Access / export your data:** TODO _(the codebase implements in-app
  account **deletion**, but no self-service data **export** endpoint was
  found. Until an export feature ships, handle access/portability
  requests manually. Either build a GDPR export feature or describe the
  manual request process here, including identity verification and the
  statutory response deadline — generally 1 month under GDPR/UK GDPR.)_
- **Exercise other rights:** contact **support@project50.fit**.

You may also lodge a complaint with your local data-protection authority.
TODO _(name the relevant authority/authorities for your markets.)_

**California (CCPA/CPRA):** TODO _(add the required CCPA/CPRA notices —
categories collected/disclosed, rights to know/delete/correct/opt-out,
"Do Not Sell or Share" (none currently), and non-discrimination — if you
have California users.)_

---

## 8. Security

We use technical and organizational measures to protect personal data,
including authentication, transport security (HTTPS/HSTS in production),
content-security policies, rate limiting, and upload validation. No
method of transmission or storage is completely secure. TODO _(describe
your incident-response/breach-notification process and access controls.)_

---

## 9. Children

The Service is not directed to children under 13 (or the higher minimum
age in your jurisdiction). We do not knowingly collect personal data from
children below that age. If you believe a child has provided us personal
data, contact **support@project50.fit** and we will delete it. TODO
_(confirm your minimum age and any parental-consent requirements for your
target markets.)_

---

## 10. Changes to this Policy

We may update this Policy from time to time. Material changes will be
communicated by reasonable means (e.g. in-app notice or updating the
"Last updated" date). Your continued use after changes take effect
constitutes acceptance where permitted by law.

---

## 11. Contact

Privacy questions or rights requests: **support@project50.fit**
TODO _(insert legal entity name, registered address, and — if
applicable — EU/UK representative and DPO contact details.)_
