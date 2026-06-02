# Mobile Coverage Policy

## Testable vs Native Split

### Held to 99% coverage (headless Jest / RNTL)

These directories run entirely in Node with `jest-expo` and must meet the 99% threshold:

| Directory | What lives here |
|-----------|----------------|
| `src/components/**` | React Native components rendered via RNTL |
| `src/lib/**` | Pure TypeScript: API client (`fetch`-based), session logic, photo helpers |
| `src/viewmodels/**` | Pure functions shaping API data for display; reuse `@project50/core` math |
| `src/screens/**` | React Native screens rendered via RNTL (logic + state; native calls excluded at call sites) |

### Explicitly excluded from thresholds (native glue)

The following patterns are excluded from coverage with documented reasons. Each exclusion is implemented via `/* istanbul ignore next */` at the exact native call-site line (or on a function that is pure native-hook wiring with no branching logic). The rest of the file is fully tested.

| Pattern / File | Exclusion scope | Reason |
|----------------|-----------------|--------|
| `index.ts` / `App.tsx` (Expo entry) | Whole file | `registerRootComponent` is a thin native call — no logic lives here; it cannot run in Node Jest |
| Navigation config (`src/navigation/**`) | Whole file | Expo Router / React Navigation native stack config is declarative wiring; exercises native bridge code that doesn't run in RNTL |
| `src/lib/session.ts` — `buildGoogleAuthRequest()` | Whole function (`/* istanbul ignore next */`) | `AuthSession.useAuthRequest` is a React hook that must be called inside a React component. It is pure native wiring: no branching logic of our own. The testable logic (handling the auth result, token exchange, storage) lives in `handleOAuthResult`, which is fully tested. |
| `src/lib/session.ts` — `buildFacebookAuthRequest()` | Whole function (`/* istanbul ignore next */`) | Same reason as `buildGoogleAuthRequest`. Pure hook wiring, no branching logic. |
| `src/lib/photo.ts` — picker call sites | Line-level `/* istanbul ignore next */` | `expo-image-picker`'s `.launchImageLibraryAsync()` / `.launchCameraAsync()` are one-liner native bridge calls. The surrounding logic (presign, upload, submit) is fully unit-tested with the picker mocked. |
| `src/screens/CelebrateScreen.tsx` share call site | Line-level `/* istanbul ignore next */` | `expo-sharing` / `Linking.openURL` is a one-liner native call. Surrounding view logic is tested. |
| `src/lib/share.ts` — `shareAsync` and `openURL` call sites | Line-level `/* istanbul ignore next */` | `expo-sharing`'s `.shareAsync()` and RN `Linking.openURL()` are single-expression native bridge calls. The surrounding logic (`isAvailableAsync` branch) is fully tested. |
| `src/screens/CelebrateScreen.tsx` — `handleShare` early-return guard | Line-level `/* istanbul ignore next */` | `if (!generatedUrl) return` is a safety guard that is unreachable via the rendered UI — the Share button is only rendered when `generatedUrl` is non-null. No branching logic of our own beyond the guard. |
| `src/navigation/AppNavigator.tsx` | Whole file (excluded via `coveragePathIgnorePatterns`) | Pure declarative React Navigation stack wiring — `NavigationContainer` + `createStackNavigator` exercise the native bridge; zero branching logic of our own. Screens are tested directly via RNTL. |
| `App.tsx` | Whole file (excluded via `coveragePathIgnorePatterns`) | `registerRootComponent` is a single native bridge call with no logic. |

## Why the split is honest

- "Native glue" means: **a single expression or React hook that delegates to a native Expo/RN module** with no branching logic of our own. If there are conditions, transformations, or error paths, those live in a tested helper — not the excluded call site.
- The 99% gate applies to **all** non-excluded source. There are no carve-outs for convenience.
- Exclusions are implemented via `/* istanbul ignore next */` comments at the exact call-site (or the function level for pure hook wrappers), keeping coverage honest everywhere else.
- The `buildGoogle/FacebookAuthRequest` functions contain zero logic — they are a single `return` delegating entirely to a React hook. Moving the hook elsewhere does not change this; the correct exclusion is the function-level ignore.

## Task exclusion log

### Task 1 (scaffold)
No additional exclusions. The 99% gate was established on `src/components/**`.

### Task 2 (API client + session)
- Added 99% gate on `src/lib/**`.
- Added exclusions for `buildGoogleAuthRequest` and `buildFacebookAuthRequest` (React hook wrappers, cannot run outside a React component tree — zero own logic).

### Task 3 (Dashboard + Log)
- Added 99% gate on `src/viewmodels/**` and `src/screens/**`.
- Added line-level exclusions for `expo-image-picker` picker call sites in `src/lib/photo.ts`.

### Task 4 (Feed + Celebrate + share)
- Added `src/lib/share.ts` line-level exclusions for `Sharing.shareAsync` and `Linking.openURL` native call sites. The `isAvailableAsync()` capability-check branch is fully tested.
- `src/screens/FeedScreen.tsx`: all view logic (state, handlers, optimistic update, revert) is tested; no exclusions needed.
- `src/screens/CelebrateScreen.tsx`: `handleShare` early-return guard (`if (!generatedUrl) return`) is excluded with `/* istanbul ignore next */` — the share button is only rendered when `generatedUrl` is non-null, making this guard unreachable through the rendered UI. All other logic is fully tested.

### Task 5 (Navigation + App entry)
- Added whole-file exclusion for `src/navigation/AppNavigator.tsx` via `coveragePathIgnorePatterns` (React Navigation native bridge wiring, zero own logic).
- Added whole-file exclusion for `App.tsx` via `coveragePathIgnorePatterns` (`registerRootComponent` native call, zero own logic).

## Device verification

Jest/RNTL tests confirm component rendering and logic correctness in a Node environment. Full device verification (layout fidelity, native interactions, camera, OAuth) requires an iOS/Android simulator and is documented as pending ("code-complete + unit-tested, device verification pending simulator access").
