# project50 Increment 2 — Recap Animation Engine (Remotion)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Generate shareable **recap videos** (day / week / 50-day) from a user's challenge data, Momentum-styled, via **Remotion**. Render server-side to MP4, store in object storage, expose on the celebrate screen to preview/download/share. The signature "animation of the day/week/50 days" feature. Hard 99% gate maintained on testable code; real video render proven locally + via a CI-safe fake renderer in the e2e.

**Architecture:**
- `packages/recap` — a Remotion project: Momentum-styled React **compositions** parameterized by challenge data (title, kind, day stats, streak, photos). Pure presentational React (driven by Remotion's `useCurrentFrame`/`interpolate`) — unit-tested by rendering at sample frames.
- **Render pipeline** behind a `RecapRenderer` interface: the real impl uses `@remotion/renderer` (`bundle` + `selectComposition` + `renderMedia`) to produce an MP4 buffer; a **fake impl** (env `RECAP_FAKE=1`) writes a tiny valid fixture MP4 — used by e2e/CI so the full flow runs without a heavy chromium render. Unit tests mock `@remotion/renderer`.
- **Backend:** new Prisma `Recap` model; `POST /api/challenges/[id]/recap` (owner-only) gathers data → renders via the renderer → uploads MP4 to storage (reuse Increment-1 storage) → creates a `Recap` row → returns a signed URL. `GET` lists a challenge's recaps with signed URLs.
- **Web:** celebrate screen gains "Generate recap" (day/week/50-day) → calls the endpoint → shows a `<video>` with the result + download + Share (reuse Phase-4 ShareActions pattern, now sharing a video).

**Tech Stack:** Remotion (`remotion`, `@remotion/renderer`, `@remotion/bundler`), React, Prisma, Vitest (mock renderer), Playwright (fake renderer). Builds on A+B + Increment 1. NOTE: real `@remotion/renderer` needs Chromium — it is used at runtime/local only; CI/e2e use `RECAP_FAKE=1`.

> **Library-verification (do FIRST in Task 1):** confirm the installed Remotion v4 API surface (`registerRoot`, `<Composition>`, `useCurrentFrame`, `interpolate`, `spring`, `@remotion/bundler` `bundle`, `@remotion/renderer` `selectComposition`+`renderMedia`). Pin exact versions. Adapt snippets to the installed API; note deltas.

---

### Task 1: `packages/recap` + Momentum compositions

- [ ] Create `packages/recap` (package.json, tsconfig, vitest.config inheriting the 99% gate + jsdom + jest-dom). Add `remotion` + React peer. Pin versions.
- [ ] `src/types.ts`: `RecapKind = "DAY"|"WEEK"|"FIFTY"`; `RecapData = { title; kind; dayNumber; lengthDays; stats:{daysCompleted;totalAmount;unit?;currentStreak}; days:{dayKey;completed;amount?;photoUrl?}[] }`.
- [ ] `src/components/*`: Momentum building blocks driven by `useCurrentFrame`/`interpolate` — e.g. `BigNumber` (Anton count-up), `RingFill` (animated volt ring), `PhotoStrip` (fades through photoUrls), `TitleCard`, `StatLine`. Each unit-tested by rendering inside a mocked Remotion frame context at specific frames (assert the interpolated value/opacity/text). Mock `remotion`'s `useCurrentFrame` to return a fixed frame in tests.
- [ ] `src/RecapVideo.tsx`: the composition component switching layout/sequence by `kind`, composed from the building blocks; `src/Root.tsx` registering `<Composition id="recap" component={RecapVideo} durationInFrames=… fps=30 width=1080 height=1920 defaultProps=…/>`. Unit-test RecapVideo renders the title/stats for each kind at a sample frame.
- [ ] `src/index.ts` barrel. `pnpm --filter @project50/recap test` 100%, typecheck, lint. Commit `feat(recap): momentum remotion compositions`.

### Task 2: Render pipeline (RecapRenderer)

- [ ] `packages/recap/src/render.ts`: `interface RecapRenderer { render(data: RecapData): Promise<Buffer> }`. `RemotionRenderer` (real): `bundle()` the Root, `selectComposition("recap", inputProps=data)`, `renderMedia({codec:"h264", ...})` to a temp file, read Buffer. `FakeRecapRenderer`: returns a tiny bundled fixture MP4 buffer (a few hundred bytes, valid MP4 header) — deterministic, no chromium. `getRenderer()` picks Fake when `process.env.RECAP_FAKE==="1"`, else Remotion.
- [ ] Unit-test: `getRenderer` selects Fake under the env flag and Remotion otherwise; FakeRecapRenderer returns the fixture bytes; RemotionRenderer is tested with `@remotion/bundler`+`@remotion/renderer` mocked — assert it bundles, selects "recap" with the data as inputProps, calls renderMedia with h264, and returns the buffer. (Real render is exercised by a local-only smoke + the e2e via Fake.)
- [ ] Commit `feat(recap): render pipeline with remotion + fake renderer`.

### Task 3: Backend — Recap model + endpoints

- [ ] Schema: add `model Recap { id; challengeId; challenge…; kind RecapKind(enum); objectKey; createdAt }` + `enum RecapKind { DAY WEEK FIFTY }`. Migration `recap`.
- [ ] `apps/web/lib/api/recap.ts`: `generateRecap(userId, challengeId, kind)`: load challenge (404), owner-only (403), build `RecapData` from challenge + dayStatuses + recent activities' media (signed photoUrls), `getRenderer().render(data)`, upload MP4 via storage (`media/<uid>/recap-<kind>-<suffix>.mp4`), create `Recap`, return `{ recapId, url: presignGet(objectKey) }`. `listRecaps(challengeId, viewerId)` → signed URLs (visibility-gated like getChallenge).
- [ ] Routes: `app/api/challenges/[id]/recap/route.ts` POST `{kind}` + GET. Integration tests (renderer = Fake via env, storage mocked or real MinIO): generates a Recap row + returns url; owner-only 403; invalid kind 422; missing 404.
- [ ] Commit `feat(web): recap generation API`.

### Task 4: Celebrate UI — generate + preview + share

- [ ] `apps/web/app/(app)/challenges/[id]/celebrate/RecapPanel.tsx` (client): buttons "Day / Week / 50-day recap" → POST `/api/challenges/:id/recap` → on success show a `<video controls src={url}>` + Download + Share (Web Share with the video URL, clipboard fallback). Loading + error states. Disabled appropriately.
- [ ] Wire into the celebrate page (pass challengeId; load existing recaps via `listRecaps`). Tests with mocked fetch: each kind posts correct body + renders the returned video URL; error state; loading state. 99% coverage.
- [ ] Commit `feat(web): recap generation UI on celebrate`.

### Task 5: e2e + green + PR/auto-merge

- [ ] Set `RECAP_FAKE=1` in the Playwright webServer env (and document it). `apps/web/e2e/recap.spec.ts`: sign in → create challenge → log an activity → celebrate → click "Day recap" → assert a `<video>` appears with a src under `media/…recap` (fake renderer produced + stored the MP4). Keep prior e2e green.
- [ ] Real-render smoke (local only, NOT in CI): a `packages/recap` script `render:sample` that renders a sample MP4 to `/tmp` using real Remotion — run it once locally to PROVE real rendering works; document the command in the recap README. Do not run it in CI (chromium heavy).
- [ ] CI: ensure `RECAP_FAKE=1` is set for the e2e job so no chromium render is attempted by the app. (Playwright's own chromium is for the browser, not Remotion.)
- [ ] Full `pnpm test` (≥99%, all packages incl recap), `typecheck`, `lint`, `build`, `pnpm test:e2e` green. Update README (recap feature + the master roadmap). Commit; push; PR; auto-merge on green.

---

## Self-Review (completed)

- **Spec coverage:** Delivers sub-project E (recap day/week/50-day) integrated with A+B + Increment-1 media. Uses the Momentum system; real MP4 render via Remotion, stored + shareable.
- **Coverage realism:** compositions + render pipeline + API + UI are unit/integration-tested with Remotion mocked (and the Fake renderer for the flow); the heavy real render is proven by a local-only smoke + exercised structurally. No exclusions; the Fake renderer is real code (tested), not a coverage dodge.
- **Security/visibility:** recap generation is owner-only; listing/serving recaps is visibility-gated and via short-lived signed URLs (consistent with Increment 1).
- **CI cost:** real chromium video render is kept OUT of CI via `RECAP_FAKE=1`; documented. Compositions are deterministic for stable tests.
- **Type consistency:** `RecapData`/`RecapKind` shared across compositions, renderer, API, and UI; `Recap` model mirrors `RecapKind`.
