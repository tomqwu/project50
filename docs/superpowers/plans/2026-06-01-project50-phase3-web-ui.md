# project50 Phase 3 — Web UI (Momentum) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Build the `@project50/ui` design system (Momentum) and the four core screens — dashboard, log-activity, feed, celebrate — plus auth UI and app shell, wired to the Phase 2 API, with component unit tests to the hard 99% gate and Playwright e2e for the UI journeys.

**Architecture:**
- `packages/ui` — presentational, prop-driven React components implementing the Momentum visual system. No data fetching, no Next-isms. Unit-tested with Testing Library to 99%.
- `apps/web` screens — **thin** Next App Router pages. Server components fetch via the Phase 2 `lib/api` services (using `requireUser`) and pass plain data to presentational components; interactive bits (log form, cheer button, sign-in) are small client components that call the API routes. Pages stay thin so they're coverable; rendering logic lives in tested `@project50/ui` components or co-located `_components` tested by rendering the (async) component with services mocked.
- Visual reference (exact tokens/type/ring): `design-explore/momentum/index.html`.

**Design tokens (Momentum):** bg `#121013`, card `#1C1A1E`, surface2 `#232026`, text `#F2F0EC`, muted `#8C8A86`, accent volt `#D6FF3F`, hairline `rgba(242,240,236,0.08)`. Display/numerals = **Anton**; body/UI = **Sora**; uppercase tracked micro-labels. One volt focal point per screen; generous black space; no gradient/emoji slop.

**Tech Stack:** Next.js 15, React 18, `@project50/ui`, Testing Library + Vitest (99% gate), Playwright. Fonts via `next/font/google` (Anton, Sora) exposed as CSS variables. Builds on Phases 0–2.

---

## File structure (Phase 3)

```
packages/ui/package.json, tsconfig.json, vitest.config.ts
packages/ui/src/tokens.ts            Momentum token constants (hex/space) — single source
packages/ui/src/theme.css            CSS variables (:root) from tokens + base resets
packages/ui/src/Button.tsx           primary/ghost/danger button
packages/ui/src/Card.tsx             dark surface card
packages/ui/src/StatTile.tsx         number + label tile (streak/badges/cheering)
packages/ui/src/ProgressRing.tsx     SVG volt ring (value/max) with glow
packages/ui/src/Label.tsx            uppercase tracked micro-label
packages/ui/src/index.ts             barrel
(+ a *.test.tsx beside each component)

apps/web/app/globals.css             import ui theme + font CSS vars
apps/web/app/(app)/layout.tsx        authed app shell + nav
apps/web/app/(app)/page.tsx          dashboard (server) → DashboardView
apps/web/app/(app)/_components/DashboardView.tsx + test
apps/web/app/(app)/challenges/[id]/log/page.tsx + LogActivityForm.tsx (client) + test
apps/web/app/(app)/feed/page.tsx (server) → FeedView + CheerButton (client) + tests
apps/web/app/(app)/challenges/[id]/celebrate/page.tsx → CelebrateView + test
apps/web/app/signin/page.tsx         Google/Facebook (+ e2e) sign-in buttons + test
apps/web/e2e/ui-journey.spec.ts      browser e2e through the UI
```

---

### Task 1: `@project50/ui` package + tokens + theme

**Files:** `packages/ui/{package.json,tsconfig.json,vitest.config.ts}`, `src/tokens.ts`, `src/theme.css`, `src/index.ts` (+ `tokens.test.ts`).

- [ ] **Step 1: package manifest** `packages/ui/package.json`:
```json
{
  "name": "@project50/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run --coverage", "typecheck": "tsc --noEmit" },
  "dependencies": { "react": "^18.3.1" },
  "devDependencies": {
    "@project50/config": "workspace:*",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "jsdom": "^25.0.0"
  }
}
```
- [ ] **Step 2: tsconfig** extends base, `jsx: react-jsx` (so components need no React import), `noEmit`, include `src`.
- [ ] **Step 3: vitest config** — jsdom + setupFiles jest-dom + coverage include `src/**/*.{ts,tsx}`, inheriting the shared 99% base.
- [ ] **Step 4: tokens (TDD)** — `src/tokens.test.ts` asserts the palette object has the exact Momentum hexes; then `src/tokens.ts`:
```ts
export const momentum = {
  bg: "#121013",
  card: "#1C1A1E",
  surface2: "#232026",
  text: "#F2F0EC",
  muted: "#8C8A86",
  accent: "#D6FF3F",
  hairline: "rgba(242,240,236,0.08)",
} as const;
export type MomentumToken = keyof typeof momentum;
```
- [ ] **Step 5: theme.css** — `:root { --bg:#121013; --card:#1C1A1E; --surface2:#232026; --text:#F2F0EC; --muted:#8C8A86; --accent:#D6FF3F; --hairline:rgba(242,240,236,0.08); }` + a base reset (box-sizing, body bg/text). Uses font CSS vars `--font-display`/`--font-body` (provided by apps/web via next/font).
- [ ] **Step 6: barrel** exports tokens; `pnpm --filter @project50/ui test` 100%, typecheck, root lint. Commit `feat(ui): momentum tokens + theme`.

### Task 2: UI primitives (TDD)

**Files:** `Button.tsx`, `Card.tsx`, `StatTile.tsx`, `ProgressRing.tsx`, `Label.tsx` + tests; extend `index.ts`.

- [ ] Each component is presentational, typed props, uses CSS variables (not hardcoded hex), no data fetching. Test each with Testing Library: renders children/value, applies variant, fires `onClick`, and (ProgressRing) renders an SVG with the correct stroke-dashoffset for value/max and `aria` label. Achieve 99%+ coverage. Reference `design-explore/momentum/index.html` for exact look (ring stroke + glow, Anton numerals, volt CTA).
  - `Button({variant?: "primary"|"ghost"|"danger", onClick?, children, disabled?})`.
  - `Card({children, as?})` — dark surface, hairline border, radius.
  - `StatTile({value, label, accent?})` — big Anton number + uppercase Label.
  - `ProgressRing({value, max, size?, label})` — SVG circle, volt stroke + glow, shows `value/max` centered; `role="img"` + `aria-label`.
  - `Label({children})` — uppercase tracked micro-label.
- [ ] Commit `feat(ui): momentum primitives (button, card, stat, ring, label)`.

### Task 3: App shell + fonts + globals + sign-in

**Files:** `apps/web/app/globals.css`, update `apps/web/app/layout.tsx` (fonts via `next/font/google` Anton+Sora → CSS vars; import `@project50/ui` theme + globals), `apps/web/app/(app)/layout.tsx` (authed shell + nav; redirects to `/signin` when no session), `apps/web/app/signin/page.tsx` + `SignInButtons.tsx` (client) + tests. Add `@project50/ui` to web deps; add `@project50/ui` to web `transpilePackages`.

- [ ] Root `layout.tsx`: load Anton + Sora via `next/font/google`, expose `--font-display`/`--font-body`, set body class. Import ui `theme.css` + `globals.css`.
- [ ] `(app)/layout.tsx`: server component; `const uid = await requireUser().catch(()=>null); if(!uid) redirect("/signin");` renders nav (logo, links) + children. Test by mocking session + asserting redirect/no-redirect (extract the gate into a tested helper if needed to keep the page thin).
- [ ] `signin/page.tsx`: renders provider buttons (Google, Facebook, and the e2e button only when `process.env.AUTH_E2E==="1"`) that call `signIn(provider)` from `@/auth` (client wrapper). Unit-test `SignInButtons` (renders buttons, calls signIn on click — mock it).
- [ ] Commit `feat(web): app shell, fonts, sign-in page`.

### Task 4: Dashboard screen

**Files:** `app/(app)/page.tsx` (thin server: `listChallenges(uid)` + for the primary challenge `getChallenge`), `_components/DashboardView.tsx` + test.

- [ ] `DashboardView({challenges, primary})` (presentational): renders primary challenge title, `Day N/50`, today's `ProgressRing` (today's DayStatus totalAmount vs dailyTarget), `StatTile`s (streak/badges/cheering), a "Log an activity" `Button` linking to the log route, and a list of other challenges. Pure props → exhaustively unit-testable (target vs binary, zero/partial/complete day, no challenges empty-state).
- [ ] Page is a thin wrapper: fetch + `<DashboardView .../>`. Test the page by mocking `lib/api/challenges` + session and rendering the resolved async component.
- [ ] Commit `feat(web): dashboard screen`.

### Task 5: Log-activity flow

**Files:** `app/(app)/challenges/[id]/log/page.tsx` + `LogActivityForm.tsx` (client) + test.

- [ ] `LogActivityForm({challengeId, goalType, unit})` (client): activity type chips, amount input (TARGET) or done toggle (BINARY), note, mood (1–5), submit → `POST /api/challenges/:id/activities`; on success `router.push` back to dashboard; on 422 show the returned error codes inline. Test with mocked `fetch`: valid submit posts correct body + redirects; 422 renders errors; mood/amount controlled. 99% coverage.
- [ ] Commit `feat(web): log-activity flow`.

### Task 6: Feed + cheer, and Celebrate

**Files:** `app/(app)/feed/page.tsx` (thin) → `_components/FeedView.tsx` + `CheerButton.tsx` (client) + tests; `app/(app)/challenges/[id]/celebrate/page.tsx` (thin) → `CelebrateView.tsx` + test.

- [ ] `FeedView({items})`: cards of followees' activities (handle, challenge title, day, optional photo placeholder, note, `CheerButton`). `CheerButton({activityId, count})` posts to reactions API, optimistic increment. Tests: renders items/empty-state; cheer posts + increments (mock fetch).
- [ ] `CelebrateView({challenge, stats, milestones})`: the Momentum day-50/milestone card — "Day 50 complete", totals, earned badges, and Save-image / Public-link / Share buttons (buttons are stubs here; real image card + public page are Phase 4 — render them disabled or as TODO-labeled, do NOT fake functionality). Test rendering for day-50 vs in-progress.
- [ ] Commits `feat(web): feed + cheer` and `feat(web): celebrate screen`.

### Task 7: UI e2e + green + PR/auto-merge

**Files:** `apps/web/e2e/ui-journey.spec.ts`; README update.

- [ ] Browser e2e (AUTH_E2E=1 webServer already set in Phase 2): sign in via the e2e button on `/signin`, land on dashboard, navigate to log a TARGET activity that meets the target, return to dashboard and assert the ring/day shows completion, open the feed. Keep prior e2e specs green. Use unique handles; assert on your own entities.
- [ ] Full `pnpm test` (core+ui+web ≥99%), `typecheck`, `lint`, `pnpm test:e2e` all green. Update README Phase 3 → done. Commit; push; open PR; auto-merge on green.

---

## Self-Review (completed)

- **Spec coverage:** Implements spec §2 visual system (Momentum) and §5 flows' UI (dashboard, log, feed, celebrate) + auth UI, wired to Phase 2 API. Sharing image/public-page deferred to Phase 4 (celebrate buttons are honest stubs, not faked).
- **Coverage realism:** rendering logic lives in prop-driven components (ui + `_components`) unit-tested to 99%; pages are thin fetch wrappers tested with mocked services; Playwright covers integration. No server-component coverage hand-waving — thin wrappers are tested by rendering the resolved async component with services mocked. No coverage exclusions beyond the documented ones.
- **Placeholder scan:** Task 1–2 carry concrete code; screens specify component prop contracts + test cases following the established pattern, with exact tokens from `design-explore/momentum`. Celebrate share buttons are intentionally non-functional stubs (clearly labeled), not placeholders-as-bugs.
- **Type consistency:** `@project50/ui` components consume `momentum` tokens; screens consume Phase 2 service return types + `@project50/core` types (DayStatus, streak, MilestoneKind); `transpilePackages` extended for `@project50/ui`.
- **Anti-slop:** one volt accent, Anton/Sora, no gradients/emoji-as-icons, generous space — per the chosen direction.
