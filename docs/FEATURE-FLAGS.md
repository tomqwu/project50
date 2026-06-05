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
| `shareInstagram` | **ON** | no | **Defense in depth, four surfaces that all agree (via `visibleCapabilities` / `isFeatureEnabled`):** (1) capabilities API `app/api/publish/capabilities/route.ts` stops advertising `INSTAGRAM`; (2) celebrate-page UI `apps/web/lib/publish/visible-capabilities.ts` hides the button; (3) the authoritative publish path `apps/web/lib/api/publish.ts` rejects an `INSTAGRAM` publish with `422 PLATFORM_DISABLED`; (4) the day-share control `apps/web/app/(app)/_components/ShareDayButton.tsx` omits its Instagram button — the flag is resolved server-side in `app/(app)/page.tsx` and threaded down as `instagramEnabled` (Client → View → Calendar → ShareDayButton). | **Kill-switch** for Instagram sharing. Flip OFF (`FLAG_SHARE_INSTAGRAM=false`) to instantly pull it — server-side, no deploy — if the Graph API / deeplink misbehaves. Enforcement holds even if the UI/capabilities are bypassed (direct API call / stale client). |
| `newOnboarding` | off | no | _(reserved)_ | Server-gated experimental onboarding flow. |
| `publicBanner` | off | yes | _(reserved)_ | Client-visible marketing banner toggle. |

> Only `shareInstagram` is wired to a real consumer today; the other two are the
> original `#126` scaffold and stay until they have a genuine use. Keep this
> table honest — a flag with no consumer is dead code.

## Operating flags in production (runbook)

Flag values are **environment variables on the Azure Container App**
(`ca-project50-web-dev` in `rg-project50-dev-canadacentral`). The flag state is
resolved from `process.env` on the server on each request, so flipping a flag is
purely an env change — **no image rebuild for a server-only flag** like
`shareInstagram`.

> ⚠️ **An env change only takes effect on a NEW revision.** A running revision keeps
> the env it started with, so every flag change must **roll a Container App
> revision**. Use `--revision-suffix` to do the env change and the roll in one step.

### Pull Instagram sharing (the `shareInstagram` kill-switch)

The fastest incident lever — instantly removes the Instagram option across all four
surfaces (capabilities API, celebrate UI, publish endpoint, day-share button)
without a code change or image rebuild:

```bash
# Force the flag OFF and roll a fresh revision in one step:
az containerapp update -g rg-project50-dev-canadacentral -n ca-project50-web-dev \
  --set-env-vars FLAG_SHARE_INSTAGRAM=false \
  --revision-suffix "killig$(date +%Y%m%d%H%M)"
```

Restore it by removing the override (it is default-ON) and rolling again:

```bash
az containerapp update -g rg-project50-dev-canadacentral -n ca-project50-web-dev \
  --remove-env-vars FLAG_SHARE_INSTAGRAM \
  --revision-suffix "restoreig$(date +%Y%m%d%H%M)"
```

> Reminder: **removing `shareInstagram` from `NEXT_PUBLIC_FLAGS` does NOT disable
> it** — it is default-ON, so it falls back to ON. Only `FLAG_SHARE_INSTAGRAM=false`
> (or `=0`) turns it off.

### Enable / disable any flag

- **Enable:** `--set-env-vars FLAG_<NAME>=true` (per-flag override, wins over
  everything), or add the camelCase name to `NEXT_PUBLIC_FLAGS` (allow-list, forces
  ON only). Then roll a revision.
- **Disable a default-OFF flag:** remove the `FLAG_<NAME>=true` and/or its
  `NEXT_PUBLIC_FLAGS` entry, then roll a revision.
- **Disable a default-ON flag:** `--set-env-vars FLAG_<NAME>=false` — the only way.

> **`NEXT_PUBLIC_FLAGS` is inlined at BUILD time** as well (it is a `NEXT_PUBLIC_*`
> var), so changing the set of force-ON **client-safe** flags requires rebuilding
> the image — see the deploy runbook in
> [`infra/azure/README.md`](../infra/azure/README.md). The server-resolved snapshot
> (`getClientFlags()` / `isFeatureEnabled`) is always recomputed from the running
> env, so server-only flags (`shareInstagram`, `newOnboarding`) need no rebuild.

### Local development

Set the same env vars in your shell or root `.env`:

```bash
FLAG_SHARE_INSTAGRAM=false pnpm --filter @project50/web dev
# or force a client-safe flag ON:
NEXT_PUBLIC_FLAGS=newOnboarding,publicBanner
```

## Adding a flag

1. Add an entry to `FLAGS` in `apps/web/lib/flags.ts` (default OFF unless it
   gates stable behaviour as a kill-switch).
2. Gate code with `isFeatureEnabled("yourFlag")`.
3. Override per-environment with `FLAG_YOUR_FLAG=true|false` (the only way to
   force a flag OFF), or list it in `NEXT_PUBLIC_FLAGS` to force it ON.
4. Add a row to the table above and a test (the lib is at 100% coverage).
