# project50 Phase 4 — Create-Challenge UI + Sharing + PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Close the create-challenge UI gap, then ship sharing (Momentum milestone image card + public share page + wired Save/Public-link/Share buttons) and make the app an installable PWA — all to the hard 99% gate with Playwright e2e. This completes the first slice (A+B).

**Architecture:**
- Create-challenge: a thin `/challenges/new` page + a client `CreateChallengeForm` POSTing to the existing `POST /api/challenges`.
- Image card: a `next/og` `ImageResponse` route (`/api/challenges/[id]/card`) rendering the Momentum celebration card from challenge stats. Handler stays thin + testable (mock `next/og` in unit tests; the e2e asserts a real `200 image/png`).
- Public share: `/c/[shareId]` read-only celebration page via a new `getChallengeByShareId` service; respects visibility (only renders when PUBLIC; FOLLOWERS/PRIVATE → 404). Wire celebrate buttons: Save image → the card route; Public link → copy `/c/:shareId`; Share → Web Share API with fallback to copy.
- PWA: `app/manifest.ts` (Next MetadataRoute.Manifest), icons, a minimal service worker for an offline app shell, and a small client `ServiceWorkerRegister`.

**Tech Stack:** Next.js 15 (`next/og`, MetadataRoute), React 18, `@project50/ui`, Vitest (99% gate), Playwright. Builds on Phases 0–3.

---

## File structure (Phase 4)

```
apps/web/app/(app)/challenges/new/page.tsx + CreateChallengeForm.tsx (client) + tests
apps/web/lib/api/challenges.ts          + getChallengeByShareId(shareId)  (+ test)
apps/web/lib/share/card-model.ts        pure: build the card view-model from challenge+stats (+ test)
apps/web/app/api/challenges/[id]/card/route.ts   GET → ImageResponse (next/og)   (+ test, next/og mocked)
apps/web/app/c/[shareId]/page.tsx       public celebration page → reuse CelebrateView (+ test)
apps/web/app/(app)/challenges/[id]/celebrate/ShareActions.tsx (client)  wired buttons (+ test)
apps/web/app/manifest.ts                PWA manifest (+ test)
apps/web/public/icon-192.png, icon-512.png   app icons (generated placeholders ok)
apps/web/public/sw.js                   minimal service worker (cache app shell)
apps/web/app/_components/ServiceWorkerRegister.tsx (client)  registers /sw.js (+ test)
apps/web/e2e/share.spec.ts              e2e: create→log→celebrate→public link→card image
```

---

### Task 1: Create-challenge UI (closes the gap)

- [ ] `apps/web/app/(app)/challenges/new/CreateChallengeForm.tsx` (client): fields — title, goalType (TARGET|BINARY), unit + dailyTarget (shown only for TARGET), startDate (date input, default today UTC), timezone (default from `Intl.DateTimeFormat().resolvedOptions().timeZone`), visibility (PUBLIC|FOLLOWERS|PRIVATE). Submit → `POST /api/challenges`; on ok → `router.push("/")`; on 422 → render `detail` error codes inline. Controlled inputs; TARGET fields required only for TARGET.
- [ ] `apps/web/app/(app)/challenges/new/page.tsx`: thin server page (requireUser) rendering the form.
- [ ] Add a "New challenge" link in the `(app)` nav and an empty-state CTA on the dashboard linking to `/challenges/new`.
- [ ] Tests (client form with mocked fetch + next/navigation): TARGET submit posts correct body + redirects; BINARY hides target fields; 422 renders errors; required validation. 99% coverage on new files.
- [ ] Commit `feat(web): create-challenge screen`.

### Task 2: Milestone image card (`next/og`)

- [ ] `apps/web/lib/share/card-model.ts` (pure, TDD): `buildCardModel({ title, daysCompleted, totalAmount, unit, dayNumber, lengthDays })` → `{ headline, subline, statText }` (e.g. headline "Day 50 complete" when dayNumber≥lengthDays else "Day N of 50"; statText "47 days · 211 min"). Exhaustively unit-test.
- [ ] `apps/web/app/api/challenges/[id]/card/route.ts`: `GET` loads the challenge + computes stats, builds the card model, returns an `ImageResponse` (from `next/og`) rendering the Momentum card (charcoal bg, volt accent, Anton headline, project50 wordmark) at 1200×630. Public-readable for PUBLIC challenges (by id is fine for the card; gate on visibility — non-public → 404). Keep the handler thin: compute model (tested) + return `new ImageResponse(<JSX/>, {width,height})`.
- [ ] Test the route with `next/og` mocked (`vi.mock("next/og", () => ({ ImageResponse: vi.fn() }))`): asserts the handler loads the challenge, builds the right model, constructs ImageResponse with 1200×630, and 404s for non-public/missing. (Real PNG rendering is asserted in the e2e.)
- [ ] Commit `feat(web): milestone image card via next/og`.

### Task 3: Public share page + getChallengeByShareId

- [ ] `lib/api/challenges.ts`: add `getChallengeByShareId(shareId)` → challenge + dayStatuses + milestones, ONLY if visibility is PUBLIC; else (or missing) return null. Integration-tested (PUBLIC returns; FOLLOWERS/PRIVATE/missing → null).
- [ ] `apps/web/app/c/[shareId]/page.tsx`: public (no auth) read-only page; if `getChallengeByShareId` null → `notFound()` (renders Next 404); else render `CelebrateView` (reused) in a minimal public shell with a project50 wordmark + "start your own" CTA to `/signin`. Test with mocked service (renders for public; calls notFound for null).
- [ ] Commit `feat(web): public share page`.

### Task 4: Wire the celebrate share buttons

- [ ] `apps/web/app/(app)/challenges/[id]/celebrate/ShareActions.tsx` (client): props `{ challengeId, shareId, visibility }`.
  - "Save image" → anchor/download to `/api/challenges/:id/card` (only enabled when visibility PUBLIC; else disabled with a "make public to share" hint).
  - "Public link" → copy `${location.origin}/c/${shareId}` via `navigator.clipboard.writeText`, show "Copied".
  - "Share" → `navigator.share({ url })` when available, else fall back to copy.
- [ ] Replace the disabled stubs in `CelebrateView` with `<ShareActions/>` (pass the data through the celebrate page).
- [ ] Tests (mock `navigator.clipboard`/`navigator.share`): copy writes the URL + shows Copied; share calls navigator.share when present, falls back to clipboard when not; buttons disabled for non-PUBLIC. 99% coverage.
- [ ] Commit `feat(web): wire celebrate share actions`.

### Task 5: PWA — manifest + service worker + register

- [ ] `apps/web/app/manifest.ts`: export default a `MetadataRoute.Manifest` (name "project50", short_name, start_url "/", display "standalone", background_color/theme_color "#121013", icons 192/512). Unit-test it returns the expected object.
- [ ] `apps/web/public/icon-192.png` + `icon-512.png`: simple generated Momentum icons (volt mark on charcoal — generate with a tiny script or a solid-color placeholder PNG; honest, not fake content).
- [ ] `apps/web/public/sw.js`: minimal SW — on install cache an app-shell list (["/","/signin"]); on fetch, network-first falling back to cache for navigations. Keep it small.
- [ ] `apps/web/app/_components/ServiceWorkerRegister.tsx` (client): in `useEffect`, if `"serviceWorker" in navigator`, register `/sw.js`. Render null. Include it in the root layout. Test with a mocked `navigator.serviceWorker.register` (registers when supported; no-op when absent).
- [ ] Commit `feat(web): PWA manifest + service worker`.

### Task 6: e2e + full green + PR/auto-merge

- [ ] `apps/web/e2e/share.spec.ts` (AUTH_E2E webServer): sign in via UI → **create a PUBLIC TARGET challenge through the new UI form** → log an activity meeting target → open celebrate → click "Public link" (assert clipboard / the link value) → open `/c/:shareId` in a fresh context (no auth) and assert it renders the celebration → `GET /api/challenges/:id/card` returns `200` with `content-type: image/png`. Keep prior e2e green. (Now that create-challenge UI exists, the journey is fully UI-driven except the no-auth public-page check.)
- [ ] Update root `layout` to include `ServiceWorkerRegister` + manifest metadata link if needed.
- [ ] Full `pnpm test` (≥99%), `typecheck`, `lint`, `pnpm --filter @project50/web build` (exit 0), `pnpm test:e2e` (all specs) green. Update README: mark Phase 4 done; note the first slice (A+B) is complete.
- [ ] Commit; push; open PR; auto-merge on green.

---

## Self-Review (completed)

- **Spec coverage:** Completes spec §1.1 (create challenge — the missing UI), and §5/§6 sharing: generated image card + public link page + Web Share, plus the installable PWA. This finishes the first slice (sub-projects A+B). Deep FB/IG/WeChat publishing (D) and recap animations (E) and native apps (C) remain separate sub-projects.
- **Coverage realism:** pure card-model + manifest are fully unit-tested; the `next/og` route and SW-register are thin glue tested with mocks; real image rendering + install path are exercised by Playwright e2e. No coverage exclusions beyond documented ones; if a glue branch is hard to cover, add a test.
- **Placeholder scan:** Task 1 + pure modules carry concrete behavior; image/PWA tasks specify exact handler/manifest contracts + mock-based tests. Icons are honest generated placeholders (not fake screenshots).
- **Type consistency:** `getChallengeByShareId` returns the same shape `CelebrateView` consumes; `ShareActions` props come from the celebrate page; card-model inputs come from challenge + DayStatus/core stats.
- **Visibility safety:** card route and public page only expose PUBLIC challenges; FOLLOWERS/PRIVATE → 404/null (no leak), consistent with Phase 2.
