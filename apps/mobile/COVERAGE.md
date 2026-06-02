# Mobile Coverage Policy

## Testable vs Native Split

### Held to 99% coverage (headless Jest / RNTL)

These directories run entirely in Node with `jest-expo` and must meet the 99% threshold:

| Directory | What lives here |
|-----------|----------------|
| `src/components/**` | React Native components rendered via RNTL |
| `src/lib/**` | Pure TypeScript: API client (`fetch`-based), session logic, helpers |
| `src/viewmodels/**` | Pure functions shaping API data for display; reuse `@project50/core` math |

### Explicitly excluded from thresholds (native glue)

The following files/patterns are excluded from coverage thresholds with documented reasons. They will be added to later tasks as the app grows.

| Pattern / File | Reason for exclusion |
|----------------|----------------------|
| `index.ts` / `App.tsx` (Expo entry) | `registerRootComponent` is a thin native call — it cannot run in a Node Jest environment; no logic lives here |
| Navigation config (`src/navigation/**`) | Expo Router / React Navigation native stack config is declarative wiring; it exercises native bridge code that doesn't run in RNTL |
| `src/lib/photo.ts` native call site | The `expo-image-picker` `.launchImageLibraryAsync()` call is a one-liner native bridge call; the logic around it (presign, upload, submit) is unit-tested with the picker mocked |
| `src/lib/session.ts` OAuth redirect | `expo-auth-session`'s `AuthSession.startAsync()` opens a native browser; the one-liner call site is excluded, while storage + credential-path logic is fully tested |
| `src/screens/CelebrateScreen.tsx` share call site | `expo-sharing` / `Linking.openURL` is a native call; the one-liner is excluded; surrounding view logic is tested |

## Why the split is honest

- "Native glue" means: **a single expression that delegates to a native Expo/RN module** with no branching logic of our own. If there are conditions, transformations, or error paths, those live in a tested helper — not the excluded call site.
- The 99% gate applies to **all** non-excluded source. There are no carve-outs for convenience.
- Exclusions are implemented via `/* istanbul ignore next */` comments on the exact call-site line (not on whole files), keeping coverage honest everywhere else.

## Device verification

Jest/RNTL tests confirm component rendering and logic correctness in a Node environment. Full device verification (layout fidelity, native interactions, camera, OAuth) requires an iOS/Android simulator and is documented as pending ("code-complete + unit-tested, device verification pending simulator access").
