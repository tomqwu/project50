# iOS App Store submission runbook

End-to-end runbook for shipping the **project50** iOS app to the App Store. It
covers App Store Connect setup, the store listing, the **App Privacy** ("privacy
nutrition label") questionnaire grounded in the data the app actually collects,
the **TestFlight** beta process, and **App Review** submission with the common
rejection pitfalls that apply to this app.

This document covers issues:

- **#99** — App Store listing (name, subtitle, description, keywords, categories,
  screenshots).
- **#100** — App Privacy nutrition labels.
- **#101** — App Review submission + rejection pitfalls.
- **#98** — TestFlight beta.

> **Every account/portal action is marked `TODO`.** This repo cannot create an
> Apple Developer account, an app record, certificates, or a submission for you.
> The runbook tells you exactly what to click and what to enter; a human with
> the founder/account credentials performs the `TODO` steps.

## App facts this runbook is grounded in

These are the actual, verified properties of the app as built. The listing and
privacy answers below derive from them — do not copy a generic template.

| Fact | Value | Source |
| --- | --- | --- |
| Framework | Expo SDK **52** / React Native 0.76 | `apps/mobile/package.json` |
| Bundle identifier | **`com.project50`** (registered App ID for app 6777206380; permanent) — set in `apps/mobile/app.json` | `apps/mobile/app.json` |
| Apple Developer Team ID | **`T32FW7PZ3S`** | Apple Developer → Membership |
| App name (home-screen label) | `project50` today → **decided `Project 50`** (short, so iOS doesn't truncate under the icon) | `apps/mobile/app.json` |
| App Store Connect app | **created** — Apple ID **`6777206380`** (draft) | App Store Connect |
| Store listing name | **`Project 50: Live in Respect`** (27 chars; verified no App Store collision) | §2 |
| Version | `1.0.0` | `apps/mobile/app.json` |
| URL scheme | `project50://` (OAuth redirect) | `apps/mobile/app.json`, `apps/mobile/src/lib/session.ts` |
| Sign-in | **Facebook** (live in the binary); **Google** wired in `session.ts` | `apps/mobile/src/screens/SignInScreen.tsx`, `apps/mobile/src/lib/session.ts` |
| Photos | Photo library + camera via `expo-image-picker`, uploaded as activity media | `apps/mobile/src/lib/photo.ts` |
| Push | `expo-notifications` for daily reminders (permission-gated, opt-in) | `apps/mobile/src/lib/push.ts` |
| Token storage | `expo-secure-store` (device keychain) | `apps/mobile/src/lib/session.ts` |
| Crash reporting | Sentry RN — **only if `EXPO_PUBLIC_SENTRY_DSN` is set**; no DSN = no-op | `apps/mobile/src/lib/crash.ts` |
| Payments | Stripe — **web only, gated, not in the mobile binary today** | `apps/web/app/api/billing/*` |
| Analytics | Web-only, env- + consent-gated, no-op by default; **no SDK in the mobile app** | `apps/web/lib/analytics.ts` |

The data the app stores about a user is defined by the Prisma schema
(`packages/db/prisma/schema.prisma`). The privacy section maps each stored field
to an Apple data category.

---

## 1. App Store Connect setup (TODO — account holder)

> All steps in this section require the Apple Developer account and are **TODO**.

1. **TODO** — Enroll in the [Apple Developer Program](https://developer.apple.com/programs/)
   ($99/yr). Use an Organization account if project50 is a company (requires a
   D-U-N-S number); otherwise Individual.
2. **TODO** — In the [Apple Developer portal](https://developer.apple.com/account),
   register an **App ID** with the production bundle identifier (see the rename
   note above). Enable the capabilities the app uses:
   - **Push Notifications** (daily reminders).
   - **Sign in with Apple** — only if you keep third-party login; see the App
     Review pitfall in §6.
3. ✅ **Done** — the App Store Connect app record exists: **Apple ID `6777206380`**
   (draft). Confirm/finish these fields on it:
   - Platform: iOS.
   - Name: `Project 50: Live in Respect` (see §2).
   - Primary language: English (U.S.) — **TODO** confirm.
   - Bundle ID: **`com.project50`** (App ID already registered; `apps/mobile/app.json`
     `ios.bundleIdentifier` is set to match exactly).
   - SKU: an internal string, e.g. `project50-ios`.
4. **TODO** — Under **Users and Access → Integrations → App Store Connect API**,
   create an **API key** (App Manager role). With the local-Xcode/Transporter
   path (§4) you sign in to **Transporter** with your Apple ID instead; the API
   key is only needed if you automate uploads (`xcrun altool`/`notarytool` or EAS
   Submit). Save the Key ID, Issuer ID, and the `.p8` file if you create one.
5. **TODO** — Agree to the latest **Paid Apps / Free Apps agreements** under
   **Business**. The app cannot be submitted until agreements are active.

---

## 2. The store listing (#99)

Fill these under **App Store Connect → your app → App Information and the version
page**. Copy is provided; **TODO** marks anything requiring a founder decision or
an external URL.

### Name and subtitle

- **App name** (30 char max): **`Project 50: Live in Respect`** (27 chars).
  - **Decided** (2026-06-05). A bare `Project 50` / `Project50` is **not** safe —
    an App Store search found established apps already using it (`Project50` by
    ISOMEM, `Project 50 Lifestyle challenge`, `Project50: 75 Soft & Be Hard`), so
    leading with the bare name risks a metadata rejection and the trademark
    exposure tracked in **#279**. The distinctive `: Live in Respect` suffix
    returned **zero** App Store results. (The home-screen icon label stays the
    short `Project 50`; the listing name and the icon label are different fields.)
- **Subtitle** (30 char max): `50-Day Habit Reset`
  - Alt: `50 days. 7 rules. No excuses.` / `Build a 50-day hard-reset habit`

### Promotional text (170 char, updatable without review)

> Start your 50-day reset today. Track 7 daily rules, log your progress with
> photos, and stay accountable with friends. Miss a day and the clock restarts.

### Description (4000 char max)

> **project50 is a 50-day hard-reset challenge.** Pick the fixed Project 50
> program — seven non-negotiable daily rules — or build your own custom plan,
> then show up every single day for 50 days. Miss a rule and your streak resets
> to day one. That's the point.
>
> **How it works**
> - Choose the Project 50 program (7 daily rules) or create a custom challenge
>   with your own target.
> - Check off each rule every day. Log activities, add a note, and attach a
>   progress photo.
> - Hit milestones at days 7, 25, and 50, and on 7- and 30-day streaks.
> - Get a daily reminder so you never miss a check-in.
> - Share day, week, and 50-day recaps when you finish.
>
> **Stay accountable**
> - Follow friends and cheer each other on.
> - Keep challenges public, followers-only, or private.
> - Block and report keep the community healthy.
>
> **Your data, your call**
> - Sign in with Facebook (or Google). We store your handle, display name, and
>   avatar — not your password.
> - Analytics and crash reporting are off unless you opt in.
>
> Fifty days. Seven rules. One reset. Start today.

**TODO** — final copy review by the founder; ensure claims match shipped
features (e.g. only mention Google sign-in if the Google button ships in v1; the
binary currently ships the Facebook button — see `SignInScreen.tsx`).

### Keywords (100 char total, comma-separated, no spaces)

```
habit,challenge,streak,50day,goals,routine,discipline,fitness,tracker,accountability,reset,daily
```

**TODO** — tune against ASO research; do not repeat words already in the app
name (Apple indexes the name separately).

### Categories

- **Primary:** Health & Fitness (the program is habit/discipline oriented).
  - Alt: Lifestyle.
- **Secondary:** Productivity.
- **TODO** — founder confirms category placement.

### URLs and contact

- **Support URL** — **TODO** (required; e.g. `https://project50.app/support`).
- **Marketing URL** — **TODO** (optional).
- **Privacy Policy URL** — **TODO**, **required**. Host `docs/legal/PRIVACY-POLICY.md`
  publicly and link it (e.g. `https://project50.app/legal/privacy`). App Review
  will reject without a reachable privacy policy.

### Age rating

Complete the **Age Rating** questionnaire. The app contains **user-generated
content** (notes, photos, social feed) which Apple treats as a maturity factor.

- Declare **user-generated content = Yes**.
- You must therefore have, and confirm in the questionnaire: a content filter or
  moderation method, the ability to **report** objectionable content, the ability
  to **block** abusive users, and a published way to contact you. The app already
  has report/block (`Report`/`Block` models in the schema) — confirm both are
  reachable in the iOS UI before declaring this.
- Expected rating: **12+** (UGC + social). **TODO** — confirm via the live
  questionnaire; do not hard-code.

### Screenshots and app preview

Required device sizes — Apple requires at least the largest size of each
supported device family; smaller sizes scale, but native sizes look better.

| Device family | Display | Required pixel size (portrait) |
| --- | --- | --- |
| iPhone 6.9" (16 Pro Max / 15 Pro Max class) | required | **1320 × 2868** (or 1290 × 2796 for 6.7") |
| iPhone 6.5" (legacy, optional if 6.9 provided) | optional | 1242 × 2688 |
| iPad 13" (only if "supportsTablet") | required for iPad | **2064 × 2752** (or 2048 × 2732) |

- `apps/mobile/app.json` sets `ios.supportsTablet: true`, so **iPad screenshots
  are required** unless you turn tablet support off before submitting. **TODO** —
  decide: ship iPad (provide 13" screenshots) or set `supportsTablet: false`.
- 3–10 screenshots per size; the first 1–3 matter most.
- App previews (video) are optional.

The screenshots themselves are produced under **#95** (Android's under #113).
This doc only specifies the requirements; see `STORE-ASSETS.md` for the full
asset checklist.

---

## 3. App Privacy nutrition labels (#100)

Filled under **App Store Connect → your app → App Privacy**. Apple asks, per data
type: *Do you collect it? Is it linked to the user's identity? Is it used for
tracking?* and the *purposes*. The answers below are grounded in the actual app
— **not** a maximal template. Where a data type is only collected when an opt-in
integration is enabled, that is called out so you can answer truthfully for your
build.

### Tracking — the headline answer

> **Used for tracking = No**, for every data type, in the default build.

"Tracking" in Apple's sense means linking data with third-party data for
advertising, or sharing with data brokers. The app does **none** of that:

- No advertising SDK, no IDFA/ATT prompt, no ad networks.
- Mobile analytics: **there is no analytics SDK in the iOS app.** Analytics
  (`apps/web/lib/analytics.ts`) is web-only, provider-agnostic, env-gated
  (`NEXT_PUBLIC_ANALYTICS_KEY`) **and** consent-gated (`hasTrackingConsent()`),
  and a no-op by default.
- Sentry (crash reporting) is first-party diagnostics, not cross-app tracking.

So you do **not** need an `NSUserTrackingUsageDescription` / App Tracking
Transparency prompt for the current build. **Flag:** if you later add a mobile
analytics/attribution SDK that links data to third parties, you must add ATT and
flip the relevant "used for tracking" answers to **Yes** (and gate it on consent,
mirroring the web pattern).

### Per-data-type answers

| Apple data type | Collected? | Linked to identity? | Tracking? | Purpose | Grounded in |
| --- | --- | --- | --- | --- | --- |
| **Name** (display name) | Yes | Yes | No | App Functionality | `User.displayName` |
| **User ID** (handle, internal id) | Yes | Yes | No | App Functionality | `User.handle`, `User.id` |
| **Photos or Videos** (progress photos) | Yes | Yes | No | App Functionality | `ActivityMedia`, `apps/mobile/src/lib/photo.ts` |
| **Other User Content** (activity notes, mood, recaps, comments) | Yes | Yes | No | App Functionality | `Activity.note`, `Activity.mood`, `Recap`, `Reaction.text` |
| **Contacts / Social graph** (follows) | Yes | Yes | No | App Functionality | `Follow` model; FB `user_friends` scope |
| **Customer Support / Other Data** (reports, blocks) | Yes | Yes | No | App Functionality | `Report`, `Block` models |
| **Email Address** | See note | — | — | — | Not persisted in schema |
| **Crash Data** | Only if Sentry DSN set | Linked* | No | App Functionality | `apps/mobile/src/lib/crash.ts` |
| **Purchases** | Not in iOS build today | — | — | — | Stripe is web-only/gated |

Notes:

- **Avatar URL** (`User.avatarUrl`) is a profile image reference — declare under
  *Photos* or *Other User Content* alongside the display name, linked to identity,
  App Functionality, no tracking.
- **Email:** Facebook/Google return an email during OAuth, but the schema does
  **not** persist an email column (verified: no `email` field on `User`; the
  handle is derived from the name/email fragment). If your build still does not
  store email at launch, you may answer **Email = Not Collected**. **TODO** —
  confirm at launch; if you add email (receipts, notifications), flip to
  Collected / Linked / App Functionality.
- **Crash Data** "Collected?" is **conditional**: answer **Yes** only if you ship
  with `EXPO_PUBLIC_SENTRY_DSN` set in the production EAS build. With no DSN,
  `crash.ts` never calls `Sentry.init` — answer **No**. *Linked:* Sentry can
  attach a user context; treat as linked to be safe, used for App Functionality
  (diagnostics), never tracking.
- **Purchases:** Stripe billing lives in `apps/web` only and is gated; the iOS
  binary has no in-app purchase / payment flow today. Answer **Purchases = Not
  Collected** for the iOS app. **TODO** — revisit if/when paid plans ship inside
  the iOS app. Note: a paid plan sold *inside* the iOS app would also have to use
  **Apple In-App Purchase**, not Stripe (App Store Guideline 3.1.1).
- **Location, Health, Financial info, Browsing history, Search history,
  Sensitive info, Audio:** **Not Collected.** The app requests no location,
  HealthKit, or microphone access.

### Permission strings (Info.plist)

EAS/Expo generates `Info.plist`; supply usage strings (via `app.json`
`ios.infoPlist` or config plugins) so iOS shows a meaningful prompt and Review
doesn't reject for a missing/empty string:

- `NSPhotoLibraryUsageDescription` — e.g. *"project50 uses your photo library so
  you can attach progress photos to your daily check-ins."*
- `NSCameraUsageDescription` — e.g. *"project50 uses the camera so you can take
  progress photos for your daily check-ins."*
- Notifications do not require a usage string, but the daily-reminder permission
  prompt should be requested in context (it is — after sign-in, `push.ts`).

**TODO** — add these strings to `app.json` before the production build (not
currently present).

---

## 4. Build the app

**Chosen path: local Xcode archive → Transporter** (no Expo/EAS account needed —
only Apple Developer signing). The EAS path is kept below as an alternative.

### Build prerequisites (verified building on this machine, 2026-06-05)

The native iOS app **builds and boots to the SignIn screen on the iPhone 17 Pro
simulator** (Xcode 26.5 / iOS 26 SDK). Getting there required fixes now on
`main` (PR #326) — keep these in mind for a clean build machine:

- **Node 20** (`.nvmrc` / `engines: >=20`). Node 25/26 break Expo SDK 52 build
  scripts (TS type-stripping, xmldom) — use `nvm use 20` before building.
- **Xcode 26.5+** with the iOS 26 SDK; **CocoaPods 1.16+**; **watchman** (Metro's
  crawler overflows on the pnpm monorepo without it).
- `react-native-purchases` must be **≥ 8.12.0** — 8.5.3's `PurchasesHybridCommon`
  fails to compile against the iOS 26 SDK (`StoreProduct` API removal).
- `apps/mobile/metro.config.js` + a direct `expo-asset` dep make Metro resolve
  under pnpm's strict layout; `react-native-gesture-handler` is a required peer.
- `apps/mobile/ios/` is **gitignored** — it's regenerated. Run `npx expo prebuild
  --platform ios` then `cd apps/mobile/ios && pod install` on a fresh checkout.

### Local Xcode archive → Transporter

1. The real identity is already set in `apps/mobile/app.json`: `ios.bundleIdentifier`
   = `com.project50`, `name` = `Project 50`. On a fresh checkout run
   `npx expo prebuild --platform ios` + `pod install`.
2. Open the generated `apps/mobile/ios/*.xcworkspace` in Xcode (Expo derives the
   native project name from the sanitized `expo.name`, so with `name: "Project 50"`
   it is `Project50.xcworkspace`). Under **Signing &
   Capabilities**, select your **Team** (Team ID **`T32FW7PZ3S`**) with automatic
   signing; set the build config to **Release**.
3. Set the run destination to **Any iOS Device (arm64)** and **Product → Archive**.
4. In the **Organizer**, either **Distribute App → App Store Connect → Upload**,
   or **Export** the `.ipa` and upload it with the **Transporter** app (sign in
   with your Apple ID). The build lands in **App Store Connect → TestFlight** for
   app `6777206380`.
5. Set `ITSAppUsesNonExemptEncryption=false` in `Info.plist` (via the `app.json`
   `ios.infoPlist`) to skip the per-build export-compliance prompt (see §5).

### Alternative: build + submit via EAS

The repo has no `eas.json` — create one. Builds via **EAS Build**, submission via
**EAS Submit** (needs an Expo account + the App Store Connect API key from §1).

1. **TODO** — `npm i -g eas-cli` and `eas login` (Expo account).
2. **TODO** — `eas init` inside `apps/mobile` to create the EAS project and set
   `extra.eas.projectId` (also consumed by push as `EXPO_PUBLIC_EAS_PROJECT_ID`).
3. Add an `eas.json` with at least a `production` profile, e.g.:

   ```json
   {
     "cli": { "version": ">= 12.0.0" },
     "build": {
       "production": { "ios": { "autoIncrement": true } },
       "preview": { "distribution": "internal" }
     },
     "submit": {
       "production": {
         "ios": {
           "appleId": "TODO@example.com",
           "ascAppId": "6777206380",
           "appleTeamId": "T32FW7PZ3S"
         }
       }
     }
   }
   ```

4. **TODO** — set EAS secrets / env for the production profile: `EXPO_PUBLIC_API_BASE_URL`
   (prod backend), `EXPO_PUBLIC_FACEBOOK_APP_ID`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
   (if Google ships), `EXPO_PUBLIC_EAS_PROJECT_ID`, and `EXPO_PUBLIC_SENTRY_DSN`
   **only if** you want crash reporting on (this decision flows into the privacy
   answers in §3).
5. **TODO** — let EAS manage signing (`eas build` prompts to create the
   distribution certificate + provisioning profile), or supply your own.
6. Build: `eas build --platform ios --profile production`.
7. Submit the build to App Store Connect / TestFlight: `eas submit --platform ios
   --profile production` (uses the App Store Connect API key from §1).

---

## 5. TestFlight beta (#98)

TestFlight distributes pre-release builds for QA before public review.

1. After `eas submit`, the build appears in **App Store Connect → TestFlight**.
   It must finish **processing** (a few minutes to ~1 hour).
2. **Export compliance:** TestFlight asks whether the app uses encryption. The
   app uses only standard HTTPS / OS-provided crypto (`expo-secure-store`,
   TLS) — answer that it uses exempt encryption. **TODO** — confirm and, to avoid
   per-build prompts, set `ITSAppUsesNonExemptEncryption=false` in `Info.plist`.
3. **Internal testing** (up to 100 testers, no Apple review of the beta):
   - **TODO** — add testers under **Users and Access** (they must be in your team
     with a role), then add them to an internal group. Builds are available
     immediately after processing.
4. **External testing** (up to 10,000 testers via email or a public link):
   - **TODO** — create an external group, add a build, and fill the **Test
     Information** (what to test, feedback email, beta description).
   - The **first** external build requires a lightweight **Beta App Review**
     (usually <24h). Provide a **demo account** because sign-in is OAuth-gated
     (see §6 — same requirement as full review).
5. Testers install via the **TestFlight** app using the invite. Collect feedback
   and crash logs (Sentry, if enabled) before promoting to full review.

Recommended gate before public submission: at least one full sign-in →
create/continue a Project 50 → log an activity with a photo → reminder →
sign-out loop verified on a physical device through TestFlight.

---

## 6. App Review submission (#101) + rejection pitfalls

### Submitting for review

1. **TODO** — on the version page, set the **Build** to the TestFlight build that
   passed beta, complete all metadata (§2), App Privacy (§3), and Age Rating.
2. **TODO** — fill **App Review Information**:
   - **Sign-in required → Yes.** Provide a **demo account**. Review cannot
     complete OAuth against your Facebook/Google app, so give either:
     - working test credentials for a Facebook test user, **or**
     - a reviewer path through the backend's e2e/demo sign-in if you expose one
       safely (the app has a dev/e2e sign-in path in `session.ts`, but it is
       *not available in production* — do **not** rely on it; prefer a real FB
       test user). **TODO** — decide and document the exact reviewer steps.
   - **Notes:** explain the 50-day reset concept, that missing a day resets the
     streak (so reviewers don't think it's a bug), and how to reach the report/
     block features.
3. **TODO** — choose **Manually release** or **Automatically release** after
   approval, then **Add for Review** / **Submit**.

### Common rejection pitfalls for this app

- **⚠️ Sign in with Apple (Guideline 4.8) — FLAG.** The app offers **third-party
  login** (Facebook today, Google wired). Apple's guideline requires apps that
  use a third-party or social login service to **also offer an equivalent login
  option that limits data collection** — historically satisfied by **Sign in with
  Apple**. There are narrow exemptions (e.g. login uses *only* your company's own
  account system). project50's OAuth via Facebook/Google is exactly the case that
  typically triggers this rule.
  - **TODO (high priority)** — add **Sign in with Apple** to the iOS app before
    submission, or be prepared to argue an exemption. This is the single most
    likely rejection. Adding it means: enable the *Sign in with Apple*
    capability on the App ID, add the button/flow (`expo-apple-authentication`),
    and a backend exchange endpoint mirroring `/api/mobile/auth/{google,facebook}`.
- **Missing privacy policy URL** (Guideline 5.1.1) — must be reachable; see §2.
- **Privacy label mismatch** — your App Privacy answers (§3) must match actual
  behavior and the privacy policy. Don't over- or under-declare.
- **Permission prompts without context / missing usage strings** (5.1.1) — ship
  the `NS*UsageDescription` strings in §3.
- **UGC without moderation tooling** (1.2) — reviewers check that report, block,
  and a contact method exist and work. Confirm the iOS UI exposes them.
- **Payments via non-IAP** (3.1.1) — do **not** add any in-app purchase of digital
  goods through Stripe in the iOS app; that requires Apple IAP. Stripe stays
  web-only.
- **Incomplete/placeholder content or broken backend** (2.1) — the prod
  `EXPO_PUBLIC_API_BASE_URL` must point at a live backend reachable from Apple's
  network during review.
- **Demo account doesn't work** (2.1) — the #1 functional rejection for
  login-gated apps. Verify the reviewer credentials right before submitting.

---

## Submission checklist

- [ ] **TODO** Apple Developer Program enrollment + agreements active (§1)
- [ ] **TODO** Production bundle id chosen and App ID + capabilities registered
- [ ] **TODO** App record created in App Store Connect + API key for EAS
- [ ] **TODO** Listing copy, keywords, categories, URLs entered (§2)
- [ ] **TODO** Privacy policy hosted + linked
- [ ] **TODO** iPad decision made (screenshots vs `supportsTablet:false`)
- [ ] **TODO** Screenshots at required sizes uploaded (assets from #95)
- [ ] **TODO** App Privacy questionnaire completed per §3 (Sentry/email/purchases conditionals resolved)
- [ ] **TODO** `Info.plist` usage strings + encryption flag added
- [ ] **TODO** `eas.json` created, secrets set, production build + submit succeeds
- [ ] **TODO** TestFlight internal + (if used) external beta passed
- [ ] **TODO** Sign in with Apple added (or exemption argued) — §6 FLAG
- [ ] **TODO** Working reviewer demo account verified
- [ ] **TODO** Submitted for review
