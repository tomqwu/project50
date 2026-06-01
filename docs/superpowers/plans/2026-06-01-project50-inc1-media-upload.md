# project50 Increment 1 — Media Upload + Truthful Counts

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let users attach **photos** to activities (presigned upload to S3-compatible storage), render them in feed/celebrate, and replace the stubbed dashboard **badges/cheering** + feed **cheer counts** with real data. Maintains the hard 99% gate. Foundation for the recap engine (E).

**Architecture:** A thin storage module (`apps/web/lib/storage.ts`) wraps an S3 client (`@aws-sdk/client-s3` + `s3-request-presigner`) pointed at MinIO (dev) / S3 (prod) via existing `S3_*` env. Presign endpoints issue PUT (upload) and GET (view) URLs; the browser PUTs the file directly to storage and sends back the `objectKey`. `logActivity` accepts `media:[{objectKey,width,height}]` and writes `ActivityMedia`. Counts are computed in the existing services from real rows. Unit tests mock the S3 client; the e2e does a real round-trip against MinIO.

**Tech Stack:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, Next 15 route handlers, Prisma, Vitest (mock S3) + Playwright (real MinIO). Builds on A+B.

---

### Task 1: Storage module + presign endpoints

**Files:** `apps/web/lib/storage.ts` (+ test), `apps/web/app/api/uploads/presign/route.ts` (+ test), `apps/web/lib/storage-config.ts`.

- [ ] Add deps to apps/web: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- [ ] `lib/storage.ts`: a lazily-constructed S3 client from `S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET` (forcePathStyle true for MinIO). Functions: `presignPut(objectKey, contentType): Promise<string>`, `presignGet(objectKey): Promise<string>`, and `newMediaKey(userId, ext): string` (deterministic-ish key under `media/<userId>/` + a caller-passed suffix — NO Date.now/Math.random in the pure key builder; accept a `suffix` arg). Unit-test with the S3 presigner mocked (`vi.mock`): asserts the right bucket/key/command are presigned.
- [ ] `app/api/uploads/presign/route.ts` POST `{contentType, ext}` → `requireUser` → validate contentType is an allowed image type (png/jpeg/webp) else 422 → build key via `newMediaKey(uid, ext, <suffix from a passed nonce or the request>)` → `presignPut` → return `{ uploadUrl, objectKey }`. Test: 401 unauth; 422 bad content type; 200 returns url+key (storage mocked).
- [ ] Commit `feat(web): s3 presigned upload endpoint`.

### Task 2: Attach media to activities + read URLs

**Files:** `apps/web/lib/api/activities.ts` (extend), `apps/web/lib/api/media.ts` (+ test), route updates, integration tests.

- [ ] Extend `logActivity` input with `media?: {objectKey:string;width:number;height:number}[]`; after creating the Activity, create `ActivityMedia` rows (order by index). Validate objectKey belongs to the user's `media/<uid>/` prefix (reject others → 422 `INVALID_MEDIA_KEY`). Integration-test: media rows created; foreign key prefix rejected.
- [ ] `lib/api/media.ts`: `withMediaUrls(activities)` helper that maps each activity's `ActivityMedia` to `{...media, url: presignGet(objectKey)}` (storage mocked in tests). Used by feed + getChallenge. Integration/unit test.
- [ ] Update `feed` and `getChallenge` to include `media` with view URLs. Update their tests.
- [ ] Commit `feat(web): attach photos to activities + signed view urls`.

### Task 3: Real counts (badges / cheering / feed cheers)

**Files:** `apps/web/lib/api/challenges.ts` + `social.ts` (extend), dashboard page + DashboardView, FeedView/CheerButton, tests.

- [ ] `getChallenge` already returns milestones via `getMilestones`; surface `badges = milestones.length`. Add `cheering = ` count of CHEER reactions on the owner's activities for that challenge (a Prisma count). Dashboard page passes real `badges`/`cheering` to `DashboardView` (remove the hardcoded 0s). Update DashboardView tests.
- [ ] `feed` items include real `cheerCount` (count of CHEER reactions per activity) and `hasPhoto` from media. `FeedView`/`CheerButton` use the real initial count (remove hardcoded 0). Update tests.
- [ ] Commit `feat(web): wire real badge/cheer counts`.

### Task 4: Log-activity photo upload UI

**Files:** `apps/web/app/(app)/challenges/[id]/log/LogActivityForm.tsx` (extend) + tests.

- [ ] Add a file input (image) to the form. On select: read the image dimensions, POST `/api/uploads/presign` → PUT the file to `uploadUrl` → keep `{objectKey,width,height}`; show a thumbnail (object URL). On submit, include `media` in the activity POST. Handle upload errors inline. Keep amount/note/mood working.
- [ ] Tests (mock `fetch` for presign + PUT, mock image load): selecting a file presigns + uploads + includes media in the submit body; upload failure shows an error and doesn't block a text-only submit. 99% coverage.
- [ ] Commit `feat(web): photo upload in log-activity`.

### Task 5: Render photos + e2e + green + PR/auto-merge

**Files:** FeedView + CelebrateView render media; `apps/web/e2e/media.spec.ts`; README.

- [ ] FeedView + CelebrateView render the first photo (signed URL) when present, with the neutral placeholder otherwise (no fake images).
- [ ] `e2e/media.spec.ts` (real MinIO via docker; webServer already has S3_* env — ensure the bucket exists, create it in the spec setup if needed via the presign/PUT round-trip): sign in → create challenge → log an activity WITH a small generated image (presign → PUT → submit) → verify the photo renders on the dashboard/feed. Keep prior e2e green.
- [ ] Ensure dev/CI bucket exists: add a tiny idempotent `ensureBucket()` (called from presign route on first use, or a setup step). In CI, run a MinIO service alongside Postgres (extend `.github/workflows/ci.yml` with a `minio` service + `S3_*` env) so the media e2e works.
- [ ] Full `pnpm test` (≥99%), `typecheck`, `lint`, `build`, `pnpm test:e2e` green. README note. Commit; push; PR; auto-merge on green.

---

## Self-Review (completed)

- **Spec coverage:** Implements the deferred A+B items — photo media (schema's `ActivityMedia`) end-to-end + truthful counts — and unblocks E (recaps need photos). 
- **Coverage realism:** storage is mocked in unit tests (the AWS SDK presigner is deterministic to assert); real upload is e2e-tested against MinIO; counts are integration-tested against Postgres. No exclusions.
- **Security:** presign requires auth; object keys are namespaced per user (`media/<uid>/`) and `logActivity` rejects keys outside the caller's prefix; view URLs are short-lived signed GETs. Content-type allowlist on upload.
- **Type consistency:** `media:[{objectKey,width,height}]` shape is consistent across presign → form → logActivity → ActivityMedia → withMediaUrls → views.
- **CI:** add a MinIO service to the workflow so the media e2e runs in CI (mirrors local docker-compose).
