# Feature flags

A tiny, env/config-driven flag system — **no external service**. Flags are
declared in a typed registry (`apps/web/lib/flags.ts`) with compile-time
defaults and resolved purely from environment variables, so the same code path
runs on the server, during SSR, and in the build. Flag state is deterministic
and side-effect free.

## The registry

Each flag is one entry in `FLAGS`:

```ts
export const FLAGS = {
  newOnboarding:  { default: false, clientSafe: false }, // demo gate
  publicBanner:   { default: false, clientSafe: true  }, // marketing toggle
  shareInstagram: { default: true,  clientSafe: false }, // kill-switch (#285)
} as const satisfies Record<string, FlagDefinition>;
```

- **`default`** — value when nothing overrides it. Default **OFF** for new/risky
  flags (merging the flag changes nothing); **ON** for a kill-switch over
  already-shipped, stable behaviour.
- **`clientSafe`** — `true` only if the flag may be exposed to the browser via
  `getClientFlags()`. Server-only flags stay `false` so their state never leaks.

`FeatureFlag` is the typed union of the registry keys, so a typo'd flag name is a
compile error.

## Reading a flag

```ts
import { isFeatureEnabled } from "@/lib/flags";

if (isFeatureEnabled("shareInstagram")) { /* show the Instagram share */ }
```

Resolution precedence (most specific first):

1. **`FLAG_<NAME>=true|false` env override** — `true/false/1/0`,
   case-insensitive, trimmed. `<NAME>` is the camelCase key in UPPER_SNAKE
   (`shareInstagram` → `FLAG_SHARE_INSTAGRAM`). This is the **only** thing that
   can force a default-ON flag **OFF**, so it is the real kill-switch; an
   explicit value here wins even when the flag is also in the allow-list.
2. **`NEXT_PUBLIC_FLAGS`** — a comma-list *allow-list that only forces flags ON*
   (e.g. `NEXT_PUBLIC_FLAGS=newOnboarding,publicBanner`). Entries are matched
   case-insensitively; unknown tokens are ignored. **It cannot disable
   anything** — omitting a flag from this list does not turn it off, it just
   falls back to the registry default. So for a default-ON flag like
   `shareInstagram`, editing `NEXT_PUBLIC_FLAGS` has no effect; use
   `FLAG_SHARE_INSTAGRAM=false`.
3. The registry **`default`**.

All readers share **one** internal resolver (`resolveFlag`), so a point read and
a serialized snapshot can never disagree:

- `isFeatureEnabled(flag)` — the #285 entry point; full precedence above.
- `isFlagEnabled(name)` — back-compat alias from `#126`; now identical to
  `isFeatureEnabled` (it also honours `NEXT_PUBLIC_FLAGS`).
- `getFlags(env)` / `getClientFlags(env)` — resolve **every** flag through the
  same path, so a flag forced ON via `NEXT_PUBLIC_FLAGS` or OFF via
  `FLAG_<NAME>=false` is reflected in the snapshot too (not just registry
  defaults). All are pure and take an injectable `env`.

> **Client snapshots are computed server-side.** `getClientFlags()` must run on
> the server (a Server Component / layout) and the result passed down to client
> components. A server-only `FLAG_<NAME>` env var is not in the client bundle, so
> resolving on the server is the only way the snapshot reflects it.
> `getClientFlags()` also omits any flag with `clientSafe: false`, so server-only
> flag state never leaks to the browser.

A/B bucketing is available via `assignVariant(key, userId, variants)` — a pure,
deterministic FNV-1a hash, stable per `(key, user)` across processes.

## Flags in use

| Flag | Default | Client-safe | Wired at | Purpose |
| --- | --- | --- | --- | --- |
| `shareInstagram` | **ON** | no | **Defense in depth, three layers that all agree (via `visibleCapabilities` / `isFeatureEnabled`):** (1) capabilities API `app/api/publish/capabilities/route.ts` stops advertising `INSTAGRAM`; (2) celebrate-page UI `apps/web/lib/publish/visible-capabilities.ts` hides the button; (3) the authoritative publish path `apps/web/lib/api/publish.ts` rejects an `INSTAGRAM` publish with `422 PLATFORM_DISABLED`. | **Kill-switch** for Instagram sharing. Flip OFF (`FLAG_SHARE_INSTAGRAM=false`) to instantly pull it — server-side, no deploy — if the Graph API / deeplink misbehaves. Enforcement holds even if the UI/capabilities are bypassed (direct API call / stale client). |
| `newOnboarding` | off | no | _(reserved)_ | Server-gated experimental onboarding flow. |
| `publicBanner` | off | yes | _(reserved)_ | Client-visible marketing banner toggle. |

> Only `shareInstagram` is wired to a real consumer today; the other two are the
> original `#126` scaffold and stay until they have a genuine use. Keep this
> table honest — a flag with no consumer is dead code.

## Adding a flag

1. Add an entry to `FLAGS` in `apps/web/lib/flags.ts` (default OFF unless it
   gates stable behaviour as a kill-switch).
2. Gate code with `isFeatureEnabled("yourFlag")`.
3. Override per-environment with `FLAG_YOUR_FLAG=true|false` (the only way to
   force a flag OFF), or list it in `NEXT_PUBLIC_FLAGS` to force it ON.
4. Add a row to the table above and a test (the lib is at 100% coverage).
