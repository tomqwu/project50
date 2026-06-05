# Dependency-security audit triage

Carryover from the #274 `pnpm audit` audit. This note records the triage of the
findings, what was fixed safely, and what is deferred (with reasons), so the
residual risk is explicit rather than implied to be zero.

Run at repo root with pnpm 9 against `pnpm-lock.yaml`.

```bash
pnpm audit            # full (dev + prod)
pnpm audit --prod     # runtime-only
```

## Before / after (advisory counts by severity)

| Scope                      | Before                               | After                               |
| -------------------------- | ------------------------------------ | ----------------------------------- |
| Full (`pnpm audit`)        | 16 — 1 critical, 11 high, 4 moderate | 10 — 1 critical, 6 high, 3 moderate |
| Prod (`pnpm audit --prod`) | 13 — 11 high, 2 moderate             | 7 — 6 high, 1 moderate              |

6 advisories were closed by this change (postcss x1 spanning web+mobile, and the
5 `@xmldom/xmldom` highs). No advisory was newly introduced.

## What ships where (matters for severity in practice)

- **`apps/web`** is the only thing that ships to the running server (Next.js on
  Azure Container Apps). The only flagged dependency that touches it is
  **postcss** (pulled in by `next` and `@remotion/bundler`), used at build time.
- **`apps/mobile`** is an Expo/React-Native app. Every other flagged package
  (`tar`, `@xmldom/xmldom`, `uuid`) is **Expo CLI / build tooling** reached via
  `expo` -> `@expo/cli` / `@sentry/react-native`. `pnpm audit --prod` reports
  these as "prod" because Expo declares them as runtime deps of its own
  packages, but they execute on the **developer/CI machine during build**, not in
  the shipped binary. They do not run on the web server.
- **Root** dev tooling: `vitest`/`vite`/`esbuild` (test runner only).

## Fixed (safe, non-breaking — applied via `pnpm.overrides`)

Added to root `package.json`:

```jsonc
"pnpm": {
  "overrides": {
    "postcss@<8.5.10": ">=8.5.10",        // -> 8.5.15 installed
    "@xmldom/xmldom@<0.8.13": ">=0.8.13"   // -> 0.9.10 installed
  }
}
```

| Package          | Was                                     | Now    | Advisories closed                                                                                     | Why safe                                                                                                                                             |
| ---------------- | --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postcss`        | 8.4.31 (web, via next), 8.4.49 (mobile) | 8.5.15 | GHSA `1117015` (moderate, XSS via unescaped `</style>`)                                               | Patch/minor within 8.x, API-stable. Web build + full test suite pass.                                                                                |
| `@xmldom/xmldom` | 0.7.13                                  | 0.9.10 | 5 highs: `1117097`, `1117894`, `1117897`, `1117900`, `1117903` (XML injection / DoS in serialization) | Only consumed by Expo's `@expo/config-plugins` -> `xcode` build tooling (Info.plist / project file generation). Mobile typecheck + jest (100%) pass. |

The `postcss` override is the one that closes a vuln in the **web server's** build
chain — the highest-value fix here.

## Deferred (no safe fix without a major bump)

| Package   | Installed    | Patched in | Advisories                                                                | Why deferred                                                                                                                                                                                                                                                                                                                         |
| --------- | ------------ | ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vitest`  | 2.1.9        | >=4.1.0    | `1120011` (critical)                                                      | 2.x -> 4.x **major**; would risk the 99% coverage suite. The vuln only applies **when the Vitest UI server is listening** (`--ui`), which we never run in CI/prod. Not exploitable in our usage. Revisit with a deliberate Vitest 4 upgrade.                                                                                         |
| `vite`    | 5.4.21       | >=6.4.2    | `1116229` (moderate)                                                      | Transitive under `vitest` 2.x (peer-pinned to vite 5). Overriding to vite 6 breaks vitest 2. Dev-server-only path-traversal. Goes away with the Vitest 4 upgrade.                                                                                                                                                                    |
| `esbuild` | 0.21.5       | >=0.25.0   | `1102341` (moderate)                                                      | Transitive under `vitest`/`vite` 5. vite 5 requires esbuild 0.21. Dev-server-only (any site can call the esbuild dev server). Not used in CI/prod build of the web app. Goes away with the Vitest 4 upgrade.                                                                                                                         |
| `tar`     | 6.2.1        | >=7.5.11   | 6 highs: `1112659`, `1113300`, `1113375`, `1114200`, `1114302`, `1114680` | 6.x -> 7.x **major** (ESM-only, API changes). Pulled in by `expo` / `@sentry/react-native` build tooling; forcing tar 7 onto Expo's CLI risks breaking mobile builds. Path-traversal on archive extraction — only triggered when the CLI extracts archives during a build, on a dev/CI machine. Revisit with the next Expo SDK bump. |
| `uuid`    | 7.0.3, 8.3.2 | >=11.1.1   | `1119441` (moderate)                                                      | 7/8 -> 11 **major** (ESM-only, API changes). Transitive under `xcode` / `@expo/rudder-sdk-node` build tooling. The bug is a missing buffer bounds check in `v3/v5/v6` **when a `buf` arg is supplied** — Expo's call sites don't pass `buf`, so it's not reachable in practice. Revisit with the next Expo SDK bump.                 |

## Residual risk (honest summary)

- **Web server (the thing exposed to the internet):** after this change, no
  open `pnpm audit` finding lands in `apps/web`'s shipped/build chain. The one
  that did (`postcss`) is fixed.
- **Mobile / dev tooling:** the remaining `tar` (6 high) and `uuid` (moderate)
  advisories live entirely in Expo's local build toolchain and are not reachable
  in the shipped mobile binary or the web server. They require a major bump
  (tar 7 / uuid 11) or — preferably — a coordinated Expo SDK upgrade, tracked
  separately. The `tar` extraction CVEs only matter when extracting untrusted
  archives during a build; our build inputs are first-party.
- **Test runner:** the `vitest` critical + `vite`/`esbuild` moderates are
  dev-only and only exploitable with the Vitest UI server / dev server bound to
  a network the attacker can reach. They are not part of CI or any deployed
  artifact. They should be retired by a single Vitest 4 upgrade.

Net: we did **not** reach zero advisories — 10 remain (1 critical, 6 high, 3
moderate), all dev/build-tooling-only and gated behind major upgrades, none in
the running web service after this change.
