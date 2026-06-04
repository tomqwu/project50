# Android Play Store submission runbook

End-to-end runbook for shipping the **project50** Android app to Google Play. It
covers Play Console setup, the store listing, the **Data safety** form grounded
in the data the app actually collects/shares, the **internal testing** track, and
**Play review** submission.

This document covers issues:

- **#117** — Play Store listing.
- **#118** — Data safety form.
- **#116** — Internal testing track.
- **#119** — Play review submission.

> **Every account/portal action is marked `TODO`.** This repo cannot create a
> Play Console account, an app record, signing keys, or a submission for you. The
> runbook tells you exactly what to click and what to enter; a human with the
> founder/account credentials performs the `TODO` steps.

## App facts this runbook is grounded in

Same app, same Prisma-backed data model as iOS (see `IOS-SUBMISSION.md` §"App
facts"). Android-specific notes:

| Fact | Value | Source |
| --- | --- | --- |
| Framework | Expo SDK **52** / React Native 0.76 | `apps/mobile/package.json` |
| Application id (package) | derived from `expo.android` — **no explicit `package` set today**, so it defaults from the slug; **TODO**: set a real one, e.g. `app.project50.android` | `apps/mobile/app.json` |
| Push | `expo-notifications` (FCM under the hood); declares the `project50-reminders` channel | `apps/mobile/src/lib/push.ts` |
| Photos | Photo library + camera via `expo-image-picker` | `apps/mobile/src/lib/photo.ts` |
| Sign-in | Facebook live; Google wired | `apps/mobile/src/screens/SignInScreen.tsx`, `apps/mobile/src/lib/session.ts` |
| Crash reporting | Sentry RN — only if `EXPO_PUBLIC_SENTRY_DSN` set; no DSN = no-op | `apps/mobile/src/lib/crash.ts` |
| Payments | Stripe — web only, gated, not in the mobile binary | `apps/web/app/api/billing/*` |
| Analytics | Web-only, env- + consent-gated; **no SDK in the mobile app** | `apps/web/lib/analytics.ts` |

> **`app.json` gaps to fix before building Android:** no `android.package` and no
> `android.adaptiveIcon.foregroundImage` are set (only `backgroundColor`). Both
> are required for a real Play build. Mark as **TODO** for the build step (§5).

---

## 1. Play Console setup (TODO — account holder)

> All steps in this section require the Google Play Console account and are **TODO**.

1. **TODO** — Create a [Google Play Console](https://play.google.com/console)
   developer account ($25 one-time). For an organization, complete the
   **organization verification** (D-U-N-S, etc.) — this can take days; start early.
2. **TODO** — Complete account-level **identity / payments verification** Google
   now requires before publishing.
3. **TODO** — **Create app** → set the default name (`project50`), default
   language (English (US)), app type (App), free/paid (Free — **TODO** confirm).
4. **TODO** — Set the **application id** in `app.json` (`expo.android.package`,
   e.g. `app.project50.android`) before the first build. The application id is
   **permanent** once published.
5. **TODO** — Decide on **Play App Signing** (recommended; let Google hold the
   app signing key while you keep an upload key). EAS can generate and manage the
   upload keystore.
6. **TODO** — Create a **service account** with the *Service Account User* +
   Play permissions and download its JSON key for EAS Submit (§5), or upload the
   first build manually.

---

## 2. The store listing (#117)

Fill these under **Play Console → your app → Grow → Store presence → Main store
listing**. Copy is shared with iOS where the limits allow; Play's limits differ.

### Text

- **App name** (30 char max): `project50`
  - **TODO** — confirm uniqueness/availability.
- **Short description** (80 char max):
  > 50-day hard-reset challenge. 7 daily rules, photo check-ins, friends.
- **Full description** (4000 char max): reuse the iOS description body
  (`IOS-SUBMISSION.md` §2). **TODO** — final founder review; keep feature claims
  truthful to the shipped Android binary (Facebook sign-in ships; mention Google
  only if its button ships).

### Categorization and contact

- **App category:** Health & Fitness (alt: Lifestyle). **TODO** — confirm.
- **Tags:** habit tracker, goals, accountability — **TODO** pick from Play's list.
- **Email** — **TODO** (required, public).
- **Website / Phone** — **TODO** (optional).
- **Privacy Policy URL** — **TODO**, **required** (host `docs/legal/PRIVACY-POLICY.md`;
  Play requires it for all apps, and especially with the data the app handles).

### Graphic assets

| Asset | Spec | Required? |
| --- | --- | --- |
| App icon | 512 × 512 PNG, 32-bit | Yes |
| Feature graphic | 1024 × 500 PNG/JPG | Yes |
| Phone screenshots | 2–8, min 320px shortest side, 16:9 or 9:16 | Yes (min 2) |
| 7"/10" tablet screenshots | up to 8 each | Only if you list tablet support |

Assets are produced under **#113** (iOS's under #95); this doc lists the
requirements only. See `STORE-ASSETS.md`.

### Content rating (IARC questionnaire)

- **TODO** — complete the **Content rating** questionnaire under **Policy → App
  content**. Declare **user-generated content / user interaction** = Yes (notes,
  photos, social feed, comments). Confirm the app exposes **report** and **block**
  (it has `Report`/`Block` models) and a way to contact you. Expected rating in
  the **Teen** range — **TODO** confirm via the live questionnaire.

### Target audience, ads, and other App content declarations

Under **Policy → App content**, complete every declaration; missing ones block
release:

- **Target audience & content:** **TODO** — set the audience (not children-
  directed → keeps you out of the Families program / Designed for Families rules).
- **Ads:** declare **No, this app does not contain ads** (no ad SDK). **TODO**
  re-confirm if you ever add one.
- **App access:** all functionality is behind **sign-in**. **TODO** — provide
  reviewer **demo credentials** here (same need as iOS; OAuth can't be exercised
  by reviewers — supply a working Facebook test user or a documented demo path).
- **Government apps / Financial features / Health:** No. **TODO** confirm.
- **Data safety:** see §3.

---

## 3. Data safety form (#118)

Filled under **Play Console → your app → Policy → App content → Data safety**.
Play asks, per data type: *Is it collected? Is it shared (sent to a third party)?
Is it processed ephemerally? Is it optional? Purpose? Is it encrypted in transit?
Can users request deletion?* The answers below are grounded in the actual app.

### Headline answers

- **Encryption in transit = Yes** for all collected data (the app talks to the
  backend over HTTPS; tokens are stored with `expo-secure-store`).
- **Data deletion:** account deletion cascades across the schema (`onDelete:
  Cascade` on `User` relations). **TODO** — expose a user-facing "delete account"
  path (UI or support email) and declare *users can request deletion = Yes* with
  that method.
- **"Shared" (Play's definition = transferred to a third party):** the app does
  **not** sell or share data for advertising. OAuth providers receive sign-in
  requests but that is the provider relationship, not "sharing" your stored data.
  Treat **Shared = No** for app data by default; the only third parties that
  *receive* data are processors (hosting, and Sentry if enabled) — Play treats
  bona-fide service providers / processors as *not* "shared". See per-type notes.

### Per-data-type answers

| Play data type | Collected? | Shared? | Optional? | Purpose | Grounded in |
| --- | --- | --- | --- | --- | --- |
| **Name** (display name) | Yes | No | No | App functionality | `User.displayName` |
| **User IDs** (handle, id) | Yes | No | No | App functionality, Account management | `User.handle`, `User.id` |
| **Photos** (progress photos) | Yes | No | Yes (optional per check-in) | App functionality | `ActivityMedia`, `photo.ts` |
| **Other user-generated content** (notes, mood, recaps, comments, reactions) | Yes | No | Yes | App functionality | `Activity.note/mood`, `Recap`, `Reaction` |
| **Other actions / social** (follows, cheers) | Yes | No | Yes | App functionality, Account management | `Follow`, `Reaction` |
| **App activity → other** (reports/blocks for moderation) | Yes | No | Yes | App functionality, Fraud prevention/safety | `Report`, `Block` |
| **Email address** | See note | No | — | Account management | Not persisted in schema |
| **Crash logs / Diagnostics** | Only if Sentry DSN set | To Sentry (processor) | No | App functionality (diagnostics) | `crash.ts` |
| **Purchase history** | Not in Android build today | — | — | — | Stripe web-only/gated |

Notes:

- **Email:** the schema persists no email column; OAuth returns an email but the
  handle is derived from it and the address is not stored. If still true at
  launch, you may declare email **Not Collected**. **TODO** — confirm; flip to
  Collected / Account management if you add email storage.
- **Crash logs:** declare under **Crash logs** and **Diagnostics** *only* if you
  ship with `EXPO_PUBLIC_SENTRY_DSN` set. With no DSN, `crash.ts` is a no-op —
  declare **Not collected**. If on: collected, *shared with Sentry as a processor*
  (declare per Play's "third party" rules; many teams list Sentry under
  processors, not "Shared" — confirm against current Play guidance), encrypted in
  transit, purpose = diagnostics. **TODO** — resolve based on your build's DSN.
- **Purchases:** Stripe is in `apps/web` only and gated; the Android binary has no
  purchase flow. Declare **Purchase history = Not collected**. **TODO** — revisit
  if paid plans ship in the Android app (note Play's billing policy: digital
  goods sold in-app generally require Google Play Billing).
- **Location, Health/fitness data, Financial info, Contacts (device address
  book), Messages, Audio, Files/Docs (beyond user-attached photos):** **Not
  collected.** No location, no HealthKit/Google Fit, no microphone, no device
  contacts access (the social graph is in-app follows, not device contacts).
- The **FCM push token** (`expo-notifications`) is a device/account identifier
  used solely to deliver daily reminders — declare under **Device or other IDs**,
  collected, not shared, purpose = App functionality (notifications).

Keep the Data safety form, the privacy policy (`docs/legal/PRIVACY-POLICY.md`),
and the iOS App Privacy labels **mutually consistent** — Play cross-checks the
form against the linked privacy policy.

---

## 4. Internal testing track (#116)

The internal testing track ships builds to up to **100 testers** instantly, with
**no Play review**, before any wider rollout.

1. **TODO** — under **Test → Internal testing → Create new release**.
2. Upload the **AAB** (Android App Bundle) produced by EAS (§5).
3. **TODO** — create a **tester list** (email addresses) and share the opt-in
   URL; testers join and install from Play.
4. Internal testing requires the **App content** declarations (§2–3) to be at
   least started, but does **not** require full review — ideal for verifying:
   sign-in → create/continue a Project 50 → log activity with photo → daily
   reminder permission → recap → report/block → sign-out, on real devices.
5. Promote a known-good internal build up the track ladder (internal → closed →
   open → production) once it passes. **TODO** — decide whether you also run a
   **closed/open** testing phase before production (Google may require a closed
   test with a minimum tester count + duration for newer personal developer
   accounts before production access is granted — check your account's
   requirements).

---

## 5. Build via EAS

> **TODO** — initial EAS account/project wiring is account work (shared with iOS;
> see `IOS-SUBMISSION.md` §4).

1. **TODO** — set `expo.android.package` and an adaptive-icon `foregroundImage`
   in `apps/mobile/app.json` (both currently missing).
2. Use the same `eas.json` as iOS; add Android submit config:

   ```json
   {
     "submit": {
       "production": {
         "android": {
           "serviceAccountKeyPath": "TODO/path/to/play-service-account.json",
           "track": "internal"
         }
       }
     }
   }
   ```

3. **TODO** — let EAS generate/manage the **upload keystore** (or supply your
   own), and enroll in **Play App Signing**.
4. **TODO** — set production env/secrets (`EXPO_PUBLIC_API_BASE_URL`,
   `EXPO_PUBLIC_FACEBOOK_APP_ID`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID` if Google ships,
   `EXPO_PUBLIC_EAS_PROJECT_ID`, and `EXPO_PUBLIC_SENTRY_DSN` only if you want
   crash reporting on — this flows into §3).
5. Build an AAB: `eas build --platform android --profile production`.
6. Submit to a track: `eas submit --platform android --profile production`
   (targets the `internal` track per the config above; uses the service-account
   JSON from §1).

---

## 6. Play review submission (#119)

1. **TODO** — complete **all** of **Policy → App content**: privacy policy,
   ads declaration, app access (with reviewer demo credentials), content rating,
   target audience, **Data safety** (§3), and any other prompted declarations.
   Play blocks the production release until every required declaration is done.
2. **TODO** — under **Production → Create new release**, add the reviewed AAB
   (promote the internal build), write **release notes**, and set the **rollout**
   (consider a **staged rollout**, e.g. 20% → 100%).
3. **TODO** — set **Countries / regions** for availability.
4. **TODO** — **Send for review**. First-time app reviews can take **several days
   to a couple of weeks** (longer than the per-update norm); plan for it.

### Common Play rejection / hold reasons for this app

- **App access:** reviewer can't get past OAuth without working **demo
  credentials** — the #1 cause of a login-gated app being rejected. Verify them
  right before submitting (same caveat as iOS).
- **Data safety mismatch:** the form must match observed behavior and the privacy
  policy. Don't over-/under-declare; resolve the Sentry/email/purchase
  conditionals in §3 for *your* build.
- **Missing/unreachable privacy policy.**
- **UGC policy:** the app must have report + block + a contact method (it does —
  confirm they're reachable in the Android UI).
- **Permissions:** Expo adds permissions from the libraries used (camera, photos,
  notifications, internet). Don't request anything the app doesn't use; each
  declared permission may need a justification. Photos/camera map to
  `expo-image-picker`; notifications to `expo-notifications`.
- **Target API level:** Google enforces a minimum `targetSdkVersion` for new
  submissions. **TODO** — confirm the EAS build targets the current required API
  level (Expo SDK 52 defaults are current as of build time, but verify against
  Play's then-current requirement).
- **Billing policy:** do **not** add in-app purchases of digital goods via Stripe
  on Android; that generally requires Google Play Billing. Stripe stays web-only.

---

## Submission checklist

- [ ] **TODO** Play Console account created + identity/org verification done (§1)
- [ ] **TODO** Application id (`expo.android.package`) set (permanent) (§1/§5)
- [ ] **TODO** Adaptive icon foreground image added to `app.json`
- [ ] **TODO** Play App Signing enrolled; upload keystore managed
- [ ] **TODO** Service account created for EAS Submit (or manual upload)
- [ ] **TODO** Store listing text, category, contact, privacy URL entered (§2)
- [ ] **TODO** Graphic assets uploaded (icon 512, feature 1024×500, screenshots) — from #113
- [ ] **TODO** Content rating questionnaire completed
- [ ] **TODO** Target audience / Ads / App access declarations completed
- [ ] **TODO** Data safety form completed per §3 (Sentry/email/purchase conditionals resolved)
- [ ] **TODO** AAB built + submitted to **internal** track; tested on real devices (§4/§5)
- [ ] **TODO** (If required for your account) closed/open test phase completed
- [ ] **TODO** Reviewer demo credentials verified
- [ ] **TODO** Production release created + sent for review (§6)
