# project50 Increment 4 — Native App (React Native + Expo, C)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A React Native (Expo, TypeScript) app `apps/mobile` that reuses `@project50/core` and the existing REST API to deliver the core flows on mobile: sign in, dashboard, photo-capture activity logging, feed, celebrate/share. Logic + components are unit/component-tested (Jest + React Native Testing Library) and wired into CI; on-device/e2e verification is documented (needs a simulator, not available in this CI/sandbox).

**Honesty / verification stance:**
- Jest + RNTL tests run in Node (no device) and CI runs them. We hold a **high coverage bar on testable logic** (API client, view-models, pure helpers, components rendered via RNTL) — target 99% on those, with **explicit, justified exclusions** for native-only glue that cannot run headless (the Expo entry/registerRootComponent, navigation native config, and native-module call sites that are thin wrappers around `expo-image-picker`/`expo-auth-session`). Exclusions are listed in a `apps/mobile/COVERAGE.md` with reasons — never used to hide real logic.
- The app is runnable via `expo start` (documented). We do NOT claim device-verified behavior we didn't observe; the README marks native as "code-complete + unit-tested, device verification pending a simulator."

**Architecture:**
- `apps/mobile` Expo Router (or React Navigation) TS app. Shared domain logic from `@project50/core` (streaks/completion/dates — already pure, RN-compatible). A typed `apiClient` wraps `fetch` to the backend (`EXPO_PUBLIC_API_BASE_URL`). Auth via a token/session stored with `expo-secure-store`; **dev/e2e sign-in** uses the backend's credentials path; **real OAuth** via `expo-auth-session` (Google/Facebook) is wired + documented but not exercised headless.
- Screens consume view-models (pure functions, fully tested) that shape API data for display, reusing `@project50/core` for any rule math.

**Tech Stack:** Expo SDK 52+, React Native, TypeScript, Jest + `@testing-library/react-native`, `expo-image-picker`, `expo-secure-store`, `expo-auth-session`, `expo-sharing`/`Linking`. Builds on A (the REST API).

> **Library-verification (Task 1):** confirm the current Expo SDK + RN + jest-expo + @testing-library/react-native versions that install cleanly together; pin them. Note any version deltas from the snippets.

---

### Task 1: Expo scaffold + test pipeline + CI

- [ ] Create `apps/mobile` as a workspace package: Expo app (`expo`, `react-native`, `react`), `app.json`/`app.config.ts` (name project50, scheme `project50`), TS config extending base where compatible, `jest-expo` preset + `@testing-library/react-native`, scripts `test` (jest --coverage), `typecheck` (tsc --noEmit), `lint`. Reuse `@project50/core` (workspace dep). Pin versions that install together.
- [ ] A trivial first screen/component (e.g. a `Brand` text using a shared color) + a passing RNTL test, proving the jest-expo pipeline + coverage work. Set a jest coverage threshold (start at the same 99% on the dirs we control: `src/lib/**`, `src/viewmodels/**`, `src/components/**`).
- [ ] CI: extend `.github/workflows/ci.yml` with a `mobile` job (or steps) running `pnpm --filter @project50/mobile typecheck` + `lint` + `test` (jest, node — NO simulator). Do NOT add an Expo build/e2e to CI.
- [ ] `apps/mobile/COVERAGE.md` documenting the testable-vs-native split + any exclusions. Commit `feat(mobile): expo app scaffold + jest pipeline + CI`.

### Task 2: API client + auth/session

- [ ] `src/lib/apiClient.ts`: typed methods for the endpoints used by the app — `listChallenges`, `getChallenge`, `logActivity` (with media), `getFeed`, `react`, `getCapabilities`, `presignUpload`, `generateRecap`, `listRecaps` — over `fetch` with the session cookie/token + `EXPO_PUBLIC_API_BASE_URL`. Typed request/response shapes (reuse `@project50/core` types where they exist). Unit-test every method with `fetch` mocked (success + error + auth-failure mapping). 99%.
- [ ] `src/lib/session.ts`: store/read/clear the auth token via `expo-secure-store` (mocked in tests); `signInDev(handle)` (calls the backend credentials path for dev/e2e); `signInWithGoogle()`/`signInWithFacebook()` via `expo-auth-session` (implemented; the native redirect call site is the documented exclusion). Unit-test the storage + dev sign-in flow (mock secure-store + fetch); the auth-session redirect is thin + excluded with justification.
- [ ] Commit `feat(mobile): typed api client + session`.

### Task 3: Dashboard + Log (photo capture)

- [ ] `src/viewmodels/dashboard.ts` (pure): shape challenges + today's status + streak (via `@project50/core`) for display. Fully tested.
- [ ] `src/screens/DashboardScreen.tsx`: renders the view-model (RN components in Momentum palette). RNTL test with the apiClient mocked.
- [ ] `src/screens/LogActivityScreen.tsx` + `src/lib/photo.ts`: pick a photo via `expo-image-picker` (the picker call is a thin wrapper — the wrapper is excluded/mocked), read dimensions, presign + upload (apiClient), submit the activity. View-model/logic tested with picker + apiClient mocked; the native picker call site is the documented thin exclusion.
- [ ] Commit `feat(mobile): dashboard + log-activity (photo capture)`.

### Task 4: Feed + Celebrate + share; CI green; PR

- [ ] `src/screens/FeedScreen.tsx` (+ view-model): followees' activities, cheer (apiClient.react). Tested.
- [ ] `src/screens/CelebrateScreen.tsx`: stats + earned badges + "Generate recap" (apiClient.generateRecap) + share via `expo-sharing`/`Linking` (share the public link / recap url; the native share call is the thin documented wrapper). Tested with apiClient mocked.
- [ ] Navigation wiring (Expo Router/React Navigation) — the navigator config is native glue (excluded/justified); screens themselves are tested.
- [ ] Full `pnpm test` (web + core + ui + recap unchanged + mobile green at its target), `pnpm typecheck`, `pnpm lint` all green. README: add the native app section (honest status), running instructions (`pnpm --filter @project50/mobile start`), and mark the A–E program complete. Commit; push; PR; auto-merge on green.

---

## Self-Review (completed)

- **Spec coverage:** Delivers sub-project C (Expo native) reusing `@project50/core` + the A backend; the core mobile flows (auth, dashboard, photo log, feed, celebrate/share). Completes the A–E program at the code level.
- **Coverage realism / honesty:** the web/core 99% gate doesn't transfer to native UI; we hold 99% on the **testable** dirs (lib/viewmodels/components) and DOCUMENT the native-glue exclusions (Expo entry, navigation config, native-module call wrappers for image-picker/auth-session/sharing) with reasons in `COVERAGE.md`. No hiding of real logic. CI runs the Node-side jest tests only — NO simulator build/e2e (explicitly out of CI). The README states native is code-complete + unit-tested, not device-verified here.
- **Reuse:** domain rules come from `@project50/core` (no duplication); API shapes mirror the backend.
- **Type consistency:** apiClient types mirror the backend route payloads; view-models consume `@project50/core` types.
- **Risk:** Expo/RN version drift — pin a co-installable set in Task 1. Native device verification is a known gap (no simulator) — documented, not faked.
