> ⚠️ **DRAFT — requires review by qualified legal counsel before use.**
> This Data Processing Addendum ("DPA") is a non-binding template. It is
> **not legal advice**. Every item marked `TODO` must be completed, and
> the whole document reviewed and approved by a licensed attorney, before
> it is executed or relied upon. Where you act as a **controller** toward
> your end users (typical for a consumer app), this DPA primarily governs
> your relationship with **your own processors/subprocessors**; adapt the
> party roles accordingly.

# Project 50 — Data Processing Addendum (DPA)

This Data Processing Addendum ("**DPA**") forms part of the agreement
between TODO _(insert your legal entity name)_ ("**Company**") and the
counterparty ("**Counterparty**") (together, the "**Parties**") for the
provision or use of the Project 50 services (the "**Service**"). It
governs the processing of personal data in connection with the Service
and is intended to satisfy the requirements of Article 28 of the EU
**GDPR** and the equivalent provisions of the **UK GDPR**.

**Roles (TODO — confirm):**
- For end-user personal data processed via the Service, the Company
  typically acts as a **controller** and engages **processors**
  (subprocessors) listed in Annex II.
- Where the Company processes personal data on behalf of a business
  customer, the Company acts as a **processor** and that customer as the
  **controller**.

TODO _(pick and adapt the role framing that matches your actual business
model; delete the framing that does not apply.)_

---

## 1. Definitions

Terms such as "**personal data**", "**processing**", "**controller**",
"**processor**", "**data subject**", and "**supervisory authority**" have
the meanings given in the GDPR / UK GDPR. "**Subprocessor**" means any
processor engaged by the Company to process personal data.

---

## 2. Scope & subject matter

2.1 The Company processes personal data only as necessary to provide the
Service and as documented in this DPA, the Privacy Policy, and any
written instructions of the controller.

2.2 **Annex I** describes the nature and purpose of processing, the
categories of data subjects, and the categories of personal data.

---

## 3. Processor obligations

The Company (or any party acting as processor) will:

1. **Process on documented instructions** only, including for
   international transfers, unless required by law (in which case it will
   inform the controller where legally permitted).
2. Ensure persons authorized to process personal data are bound by
   **confidentiality**.
3. Implement appropriate **technical and organizational measures**
   (Annex III), having regard to the state of the art and the risks.
4. Engage **subprocessors** only under Section 4.
5. **Assist** the controller, taking into account the nature of
   processing, in responding to **data-subject rights** requests
   (access, rectification, erasure, portability, restriction,
   objection).
6. **Assist** the controller with security, breach notification, data
   protection impact assessments, and prior consultations
   (Articles 32–36).
7. **Notify** the controller without undue delay after becoming aware of
   a **personal-data breach**. TODO _(insert notification window, e.g.
   "within 48 hours", and contact channel.)_
8. At the controller's choice, **delete or return** all personal data at
   the end of the services and delete existing copies, unless retention
   is legally required.
9. Make available information necessary to demonstrate compliance and
   allow for and contribute to **audits**, subject to reasonable
   confidentiality and security limits. TODO _(define audit frequency,
   notice, and cost allocation.)_

---

## 4. Subprocessors

4.1 The controller provides **general authorization** for the Company to
engage the subprocessors listed in **Annex II**.

4.2 The Company will impose data-protection obligations on each
subprocessor that are no less protective than those in this DPA, and
remains liable for its subprocessors' performance.

4.3 The Company will inform the controller of intended **changes** to its
subprocessors (additions/replacements), giving the controller an
opportunity to object on reasonable data-protection grounds. TODO
_(insert the change-notice period, e.g. 30 days, and the notification
method.)_

---

## 5. International transfers

Where processing involves transfers of personal data outside the
EEA/UK to a country without an adequacy decision, the Parties will rely
on an appropriate transfer mechanism — the EU **Standard Contractual
Clauses** (Commission Decision 2021/914) and, for UK data, the UK
**International Data Transfer Addendum (IDTA)** or the UK Addendum to the
SCCs — which are incorporated by reference and completed in **Annex IV**.
TODO _(complete the SCC module selection and Annexes; confirm the actual
transfer mechanism per subprocessor.)_

---

## 6. Liability, term & miscellaneous

6.1 This DPA is effective for as long as the Company processes personal
data in connection with the Service.

6.2 Liability under this DPA is subject to the limitations in the main
agreement. TODO _(reconcile with the Terms of Service limitation of
liability.)_

6.3 If any conflict arises between this DPA and the main agreement on the
processing of personal data, this DPA prevails.

6.4 This DPA is governed by the law specified in the main agreement.
TODO _(confirm governing law matches the Terms of Service.)_

---

## Annex I — Description of processing

| Item | Detail |
|---|---|
| **Subject matter** | Provision of the Project 50 habit/challenge-tracking service. |
| **Duration** | For the term of the agreement / account lifetime, plus any legally required retention. |
| **Nature & purpose** | Hosting, storage, display, and processing of user accounts, challenges, activity logs, media, and social interactions; payments (if enabled); error monitoring (if enabled). |
| **Categories of data subjects** | Registered end users of the Service. |
| **Categories of personal data** | Profile data (handle, display name, avatar URL, OAuth provider + provider account ID); challenge & activity data (titles, logs, amounts, notes, mood, timezones); uploaded photos & recap media; social graph (follows); reactions & comments; blocks & reports; session/authentication data; diagnostic data (if Sentry enabled); billing data via Stripe (if paid plans enabled). |
| **Special-category data** | Not intentionally collected. TODO _(note that free-text notes, mood, and user-uploaded photos could incidentally contain sensitive data; assess and document mitigations.)_ |
| **Frequency** | Continuous, for the duration of use. |

---

## Annex II — Subprocessor list

> TODO — **Fill in the actual vendors, plans, and regions you use in
> production.** The entries below reflect the integrations present in (or
> planned for) the codebase. "Location" is the region where data is
> processed/stored and must be confirmed per your account configuration.

| # | Subprocessor | Purpose | Categories of personal data processed | Location / region |
|---|---|---|---|---|
| 1 | **Google** (Google LLC) | OAuth sign-in / authentication | Authentication identifiers, basic profile (name, email, avatar) returned at sign-in | TODO _(e.g. US / global)_ |
| 2 | **Facebook / Meta** (Meta Platforms) | OAuth sign-in / authentication | Authentication identifiers, basic profile returned at sign-in | TODO _(e.g. US / global)_ |
| 3 | **Stripe** | Payment & subscription processing (if/when paid plans launch) | Billing & transaction data, card data (handled directly by Stripe), billing country | TODO _(e.g. US / EU)_ |
| 4 | **Sentry** | Error & performance monitoring (only if enabled via DSN) | Diagnostic/error data, limited request context | TODO _(e.g. US / EU)_ |
| 5 | **Object-storage provider** (S3-compatible) | Storage of uploaded photos and recap media | Uploaded images and recap media (User Content) | TODO _(insert vendor: AWS S3 / Cloudflare R2 / self-hosted MinIO, and region)_ |
| 6 | **Hosting / compute & database provider** | Application hosting and primary database | All application personal data at rest and in transit | TODO _(insert vendor and region)_ |
| 7 | TODO _(email / transactional messaging, if added)_ | Notifications, receipts | Contact details, message content | TODO |
| 8 | TODO _(analytics, if added)_ | Product analytics | Usage/event data | TODO |

---

## Annex III — Technical & organizational measures (TOMs)

Summary of measures in place (confirm and expand with counsel and your
infrastructure team):

- **Access control & authentication:** OAuth-based sign-in; JWT session
  cookies with bounded lifetime; Secure cookies on HTTPS deployments.
- **Network & app security:** HTTPS/HSTS in production; content-security
  policy; security headers; rate limiting; upload validation/safety.
- **Least privilege:** TODO _(describe access controls to the database
  and object storage; secrets management; key rotation.)_
- **Encryption:** TODO _(confirm encryption in transit and at rest for
  database, object storage, and backups.)_
- **Logging & monitoring:** Structured application logging; optional
  Sentry error monitoring. TODO _(confirm log retention and access.)_
- **Backups & resilience:** TODO _(describe backup cadence, retention,
  and restore testing.)_
- **Deletion:** Cascading database deletion on account deletion. TODO
  _(confirm object-storage and backup deletion propagation.)_
- **Incident response:** TODO _(document breach-detection and
  notification procedures.)_

---

## Annex IV — Transfer mechanism details (SCCs / UK IDTA)

TODO _(complete this annex: select SCC module(s), identify the data
exporter and importer for each transfer, attach the completed SCC
appendices, and confirm the UK IDTA/Addendum where UK data is involved.)_
