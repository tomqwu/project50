# project50 Increment 3 — Hybrid Social Publishing (D)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Share a milestone's **image card** (Phase 4) and **recap video** (Increment 2) to Facebook / Instagram / WeChat via a **hybrid** approach: a `Publisher` abstraction with per-platform adapters that use official APIs *where configured*, and otherwise fall back to Web Share / deep links — with **honest capability flags** so the UI never fakes a successful post. Hard 99% gate.

**Architecture & honesty stance:**
- Real "post on the user's behalf" to Facebook/Instagram needs publish-scope OAuth tokens + app review (our auth only does *login*). WeChat's content API needs a China MP entity. So: adapters are **capability-flagged**. By default (no platform credentials configured) each platform's capability is `method: "DEEPLINK" | "WEBSHARE"` with `apiAvailable: false` and a clear reason; the user shares the generated asset themselves. When credentials ARE configured (env), the API adapters actually call the platform (Graph API video/photo publish; IG content-publishing; WeChat JS-SDK config) — implemented and unit-tested with the API mocked. **No fake "Posted!" states ever.**
- A `Publisher` registry computes capabilities from env at request time; the UI surfaces them truthfully.

**Tech Stack:** Next 15 route handlers, the existing image-card route + recap storage, Vitest (mock platform APIs), Playwright (share-sheet/deep-link path). Builds on A+B + Inc 1–2.

---

### Task 1: Publisher abstraction + adapters

**Files:** `apps/web/lib/publish/types.ts`, `registry.ts`, `adapters/{webshare,facebook,instagram,wechat}.ts` (+ tests).

- [ ] `types.ts`: `Platform = "FACEBOOK"|"INSTAGRAM"|"WECHAT"|"WEBSHARE"`; `AssetKind = "IMAGE"|"VIDEO"`; `PublishAsset = {kind:AssetKind; url:string; caption?:string}`; `PublishMethod = "API"|"DEEPLINK"|"WEBSHARE"`; `Capability = {platform:Platform; method:PublishMethod; apiAvailable:boolean; reason?:string}`; `PublishResult = {ok:boolean; method:PublishMethod; externalUrl?:string; shareUrl?:string; error?:string}`; `interface Publisher { platform:Platform; capability(): Capability; publish(asset:PublishAsset): Promise<PublishResult> }`.
- [ ] `adapters/webshare.ts`: always `apiAvailable:false, method:"WEBSHARE"`; `publish` returns `{ok:true, method:"WEBSHARE", shareUrl: asset.url}` (the client performs the actual `navigator.share`). 
- [ ] `adapters/facebook.ts`: reads `FB_PAGE_ID`/`FB_PAGE_TOKEN`. If absent → capability `{method:"DEEPLINK", apiAvailable:false, reason:"Facebook publishing not configured (needs page token + app review)"}` and `publish` returns a Facebook **sharer deep link** (`https://www.facebook.com/sharer/sharer.php?u=<encoded asset.url>`, `method:"DEEPLINK"`). If present → `apiAvailable:true, method:"API"`; `publish` calls the Graph API (`POST /{page}/videos` for VIDEO with `file_url`, `/{page}/photos` for IMAGE with `url`) using `fetch`; returns `{ok, externalUrl}` or `{ok:false,error}`. Unit-test BOTH config branches with `fetch` mocked.
- [ ] `adapters/instagram.ts`: reads `IG_USER_ID`/`IG_TOKEN`. Absent → `{method:"DEEPLINK", apiAvailable:false, reason:"Instagram publishing requires a business account + app review"}`, `publish` returns a share/deeplink fallback (IG has no public web sharer for arbitrary URLs → return `method:"WEBSHARE"` shareUrl as the practical fallback, reason noted). Present → two-step Content Publishing (create media container → publish) via mocked `fetch`. Unit-test both branches.
- [ ] `adapters/wechat.ts`: reads `WECHAT_APP_ID`. Absent → `{method:"WEBSHARE", apiAvailable:false, reason:"WeChat share requires the WeChat in-app browser / official account"}`; `publish` returns `{ok:true, method:"WEBSHARE", shareUrl: asset.url}`. Present → returns JS-SDK share config params (`method:"API"` meaning client configures wx.share) — return the config in `externalUrl`/a config object. Unit-test both.
- [ ] `registry.ts`: `getPublisher(platform): Publisher`; `getCapabilities(): Capability[]` (all platforms' current capabilities). Unit-test the registry maps every platform + capabilities reflect env.
- [ ] Commit `feat(web): social publisher abstraction + adapters`.

### Task 2: Publish API + asset resolution

**Files:** `apps/web/lib/api/publish.ts` (+ test), `app/api/challenges/[id]/publish/route.ts`, `app/api/publish/capabilities/route.ts` (+ tests).

- [ ] `lib/api/publish.ts` `publishChallengeAsset(userId, challengeId, platform, assetKind)`: load challenge (404), **owner-only** (403); resolve the asset URL — IMAGE → the card route URL (`/api/challenges/:id/card`, absolute via a base-url helper) requiring the challenge be PUBLIC (else 422 `MUST_BE_PUBLIC`); VIDEO → the latest `Recap` for the challenge (404 `NO_RECAP` if none) signed URL; build caption from challenge title/stats; `getPublisher(platform).publish(asset)`; return the `PublishResult`. Integration-test owner-only, MUST_BE_PUBLIC, NO_RECAP, and a successful deeplink/webshare result (platform APIs unconfigured in test env → deeplink path).
- [ ] Route `app/api/challenges/[id]/publish/route.ts` POST `{platform, assetKind}` (validate enums → 422); `app/api/publish/capabilities/route.ts` GET → `getCapabilities()`. Tests: 401, 422 bad platform/kind, 403 non-owner, 200 result.
- [ ] Commit `feat(web): publish API + asset resolution`.

### Task 3: Share panel UI (honest capabilities)

**Files:** `app/(app)/challenges/[id]/celebrate/SocialShare.tsx` (client) + celebrate wiring + tests.

- [ ] `SocialShare.tsx` props `{challengeId, hasRecap, isPublic, capabilities}`: a row of platform buttons (Facebook / Instagram / WeChat) + asset toggle (Image card / Recap video, the latter disabled when `!hasRecap`). Each button shows its capability honestly: if `apiAvailable` → "Post to X"; else a subtitle like "Opens share" / the `reason`. On click → POST `/api/challenges/:id/publish` → on `method:"WEBSHARE"` call `navigator.share({url: shareUrl})` (clipboard fallback); on `method:"DEEPLINK"` open `shareUrl` in a new tab; on `method:"API"` show success with `externalUrl`. Image card requires `isPublic` (disable + hint otherwise). Loading/error states. NEVER show "Posted!" unless `result.ok && method==="API"`.
- [ ] Wire into celebrate page (load `getCapabilities()` server-side; pass `hasRecap` from `listRecaps`, `isPublic` from challenge). Keep existing celebrate tests green.
- [ ] Tests (mock fetch + navigator.share/clipboard + window.open): each platform posts correct body; webshare→navigator.share; deeplink→window.open; api→success url; disabled states (no recap, not public); honest labels from capabilities. 99% coverage.
- [ ] Commit `feat(web): social share panel on celebrate`.

### Task 4: e2e + green + PR/auto-merge

**Files:** `apps/web/e2e/social.spec.ts`; README.

- [ ] e2e (no real posting; APIs unconfigured → deeplink/webshare): sign in → create PUBLIC challenge → log → celebrate → assert the SocialShare panel renders all three platforms with honest capability text → click Facebook (deeplink) and assert a new tab/URL to facebook sharer with the card URL is triggered (intercept `window.open` via `page.on('popup')` or stub it) OR assert the publish API returns a deeplink result. Keep prior e2e green.
- [ ] Full `pnpm test` (≥99%), `typecheck`, `lint`, `build`, `pnpm test:e2e` green. README: note social sharing (hybrid) + mark the program roadmap. Commit; push; PR; auto-merge on green.

---

## Self-Review (completed)

- **Spec coverage:** Delivers sub-project D (FB/IG/WeChat) as an **honest hybrid** — official-API adapters (gated by config, tested with mocks) + deep-link/Web-Share fallbacks that work today; the assets are the Phase-4 card + Increment-2 recap. Matches the user's "Hybrid" choice.
- **Honesty:** capabilities are computed from env and surfaced truthfully; no faked "Posted!"; image sharing requires the challenge be PUBLIC (no private-data leak via the card URL, consistent with Phase 4).
- **Coverage realism:** adapters' API + fallback branches both unit-tested (fetch mocked); registry/capabilities tested; route owner-only/validation tested; UI tested with mocked browser share APIs; e2e covers the fallback path. No exclusions; the API adapters are real code, mock-tested.
- **Security:** publish is owner-only; image card only for PUBLIC challenges; video via signed recap URL; no platform secrets committed (env only, documented placeholders in .env.example).
- **Type consistency:** `Platform`/`AssetKind`/`Capability`/`PublishResult` shared across adapters, registry, API, and UI.
