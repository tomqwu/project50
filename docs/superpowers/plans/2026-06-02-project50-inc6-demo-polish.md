# project50 Increment 6 — Demo Photos + Landing + Smoke

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make the demo *visually* compelling and the project easy to sanity-check: seed real **photos** (so feed + celebrate show pictures), turn the bare `/signin` into a proper **landing** page (Momentum), and add a **`make smoke`** end-to-end sanity command. Hard 99% gate on web; seed stays in `packages/db` (outside the gate).

---

### Task 1: Photos in the demo seed

**Files:** `packages/db/prisma/seed-assets/*.jpg` (a few small bundled images), `packages/db/prisma/seed.ts` (extend), `packages/db/package.json` (deps).

- [ ] Add a few **small, real fitness/outdoor photos** under `packages/db/prisma/seed-assets/` (download 3–4 from Unsplash, downscale to ~800px / <120KB each, commit them — bundled so the seed needs no network at run time). Name them e.g. `run.jpg`, `gym.jpg`, `trail.jpg`, `bike.jpg`.
- [ ] Add `@aws-sdk/client-s3` to `packages/db` deps. Extend the seed: a helper `uploadSeedPhoto(filePath, objectKey)` using the S3 client (endpoint/keys from env, `forcePathStyle:true`), calling an idempotent bucket-ensure first. For the demo user (and maya's feed challenge), attach `ActivityMedia` rows to several recent activities — upload each bundled image to `media/<ownerUserId>/seed-<n>.jpg`, read its real width/height (use `image-size` devDep or a tiny header parser), and create `ActivityMedia{objectKey,width,height,order}`. So the demo's celebrate hero + the feed cards render real photos.
- [ ] Keep the seed idempotent (the delete-then-recreate already cascades ActivityMedia). Re-run twice to confirm.
- [ ] Verify (query) ActivityMedia rows exist for demo + maya activities; confirm the objects exist in MinIO. `pnpm --filter @project50/web test` still green/100% (unaffected). Commit `feat(db): seed demo photos into MinIO`.

### Task 2: Landing page + `make smoke`

**Files:** `apps/web/app/signin/page.tsx` + `SignInButtons.tsx` (enhance) + tests; `Makefile`; `apps/web/e2e/*` unchanged.

- [ ] Turn `/signin` into a real **landing + sign-in** (Momentum): a hero (project50 wordmark in Anton, a one-line value prop "Run a 50-day challenge. Track it. Share it."), 2–3 short feature bullets (challenges + streaks / photo logging / shareable recaps), then the sign-in card (Google, Facebook, and the gated "Continue as demo account"). Keep it a thin server page + the existing client `SignInButtons`. Use `@project50/ui` tokens/components. No fake data, no stock hero photo unless it's one of the bundled seed images used honestly as a sample.
- [ ] Update `signin/page.test.tsx` + `SignInButtons.test.tsx` for the new content; keep 100% coverage. (The `data-testid="home"` on the heading must remain so `home.spec.ts` stays green.)
- [ ] **`make smoke`**: add a Makefile target that runs a quick real end-to-end sanity against the app: `smoke: env services migrate e2e-install` → recipe runs the API journey spec headlessly, e.g. `pnpm --filter @project50/web exec playwright test journey.spec`. (It boots the app via Playwright's webServer, signs in, creates a challenge, logs an activity, verifies completion + 401-on-unauth — a real smoke without a browser UI.) Add a help description.
- [ ] Commit `feat(web): landing page + make smoke`.

### Task 3: Green + PR/auto-merge

- [ ] Full `pnpm test` (≥99% web), `typecheck`, `lint`, `pnpm --filter @project50/web build` (exit 0), `pnpm test:e2e` (all green). Run `make seed` then confirm (best-effort) the seeded photos resolve. Update README (mention demo photos + `make smoke`). Commit; push; PR; auto-merge on green.

---

## Self-Review (completed)

- **Scope:** visual + DX polish on top of the working MVP. No security/posture change. Seed photos are real bundled images uploaded to dev MinIO; not faked.
- **Coverage:** web stays at the 99% gate (landing/page + SignInButtons tested; `home` testid preserved for e2e). Seed + bundled assets live in `packages/db` (outside the gate, like migrations) — documented.
- **Honesty:** no stock-photo slop in the product UI; the landing uses the Momentum system; the only images are the demo's own seeded activity photos. `make smoke` runs the REAL journey spec (no faked success).
- **Reuse:** seed continues to use `@project50/core` for rule math; the landing uses `@project50/ui`.
