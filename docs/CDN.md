# Media CDN & Image Optimization

Project 50 stores user-generated media (activity photos, rendered recap MP4s)
in **Azure Blob Storage** — a single **private** container on the
`azurerm_storage_account.media` account (see `infra/azure/main.tf`), running
alongside the web app on **Azure Container Apps**. Media is served to browsers
via short-lived, per-request **SAS GET URLs** minted by the app, not from a CDN.

This document describes the current delivery model, why a CDN in front of Blob
has **limited value today**, and the Azure-native path to add one **later** as a
future enhancement (with its prerequisites). It is honest about the present:
**there is no CDN in this deployment** — the infra contains no `azurerm_cdn_*`
or Front Door resource, and this is intentional given the model below.

## TL;DR

- **Current state:** media lives in a **private** Azure Blob container and is
  delivered via **5-minute SAS GET URLs** (`presignGet()` in
  `apps/web/lib/storage.ts`). Uploaded objects carry
  `Cache-Control: private, max-age=31536000, immutable` so the **browser** caches
  them for a year, but **shared/edge caches and CDNs must not** retain them.
- **No CDN today, by design.** SAS URLs are per-request signed and expire in
  5 minutes, so an edge cache can't cache them effectively and **must not** serve
  them past expiry. A CDN in front of these URLs buys almost nothing.
- **`next/image` is also disabled** for this media for the same reason — the app
  uses raw `<img>` (see `apps/web/next.config.mjs`).
- **A CDN becomes worthwhile only after** migrating hot/public media (feed
  photos, public share-page images) to **stable, public (non-signed) URLs**.
  The Azure-native path for that is **Azure Front Door** / **Azure CDN** in front
  of the storage account — **not** CloudFront. See [Future enhancement](#future-enhancement-azure-front-door--azure-cdn).

## Current architecture (Azure Blob + SAS, no CDN)

```
browser ──▶ Azure Blob (private container)
   ▲              via a 5-min SAS GET URL minted per request by the app
   │
   └── app (Container Apps) mints the SAS URL with its MANAGED IDENTITY
       (user-delegation key), then the browser fetches the blob directly.
```

The Next.js app never proxies durable media bytes through itself. To **view** a
private object the app calls `presignGet(objectKey)` (`apps/web/lib/storage.ts`),
which returns a **Blob SAS GET URL** scoped to that one blob and valid for
**5 minutes** (`PRESIGN_EXPIRY`). The browser then fetches the bytes directly
from `*.blob.core.windows.net`. Uploads use the mirror-image `presignPut()`
(a 5-min SAS `racw` URL + a direct browser `PUT`).

Authentication is via the app's **managed identity** in production: the app
holds **no account key** and signs SAS URLs with a short-lived
**user-delegation key** (`getUserDelegationKey()`), cached ~1h. The container is
`container_access_type = "private"` and the account sets
`allow_nested_items_to_be_public = false` (`infra/azure/main.tf`) — so blobs are
**never** anonymously readable; the SAS signature is the only way in.

### Cache-Control: `private, max-age=31536000, immutable`

Object keys are content-addressed and immutable —
`media/<userId>/<suffix>.<ext>` via `newMediaKey()` — so the bytes at a given key
never change. Server-side uploads (`putObject`, used for recap MP4s) therefore
set:

```
Cache-Control: private, max-age=31536000, immutable
```

The choice of **`private`** (not `public`) is deliberate and load-bearing (see
the `IMMUTABLE_CACHE_CONTROL` constant + comment in `apps/web/lib/storage.ts`):

- `max-age=31536000, immutable` lets the **per-user browser cache** keep the
  bytes for a year — a real perf win, since the key never changes.
- **`private`** forbids **shared caches and CDNs** from storing the response.
  Because delivery is via 5-minute SAS URLs, a shared/edge cache that retained
  the bytes could replay a signed URL and serve it **long after the 5-min
  expiry**, bypassing the access control on private media (including recap MP4s
  for PRIVATE/FOLLOWERS challenges). `private` keeps the browser-cache win while
  forbidding any shared/CDN storage.

So the cache policy is, by design, **browser-cacheable but CDN-hostile** — which
is exactly the right posture for short-lived, per-request signed URLs.

## Why a CDN in front of Blob has limited value today

A CDN's value is edge caching: many requests collapse onto one cached object
keyed by URL. The current delivery model defeats that on every axis:

1. **Cache-key churn on the signature.** Each `presignGet()` returns a URL with a
   fresh SAS query string (signature, `se` expiry, etc.). The CDN cache key is
   the URL, so it **churns on every render** — the edge would re-fetch the same
   blob each time, with no hit-rate benefit.
2. **Short expiry + access control.** The URLs expire in **5 minutes**, and the
   `private` Cache-Control explicitly tells shared caches **not** to store them.
   Caching them would be both ineffective and a **security problem** (serving
   bytes past expiry — see above).
3. **No stable, dimension-bearing URLs for `next/image`.** The same signed,
   expiring, query-churning URLs also defeat the Next.js image optimizer (its
   cache key never stabilizes, and the upstream 403s after 5 minutes). This is
   the **documented reason the app uses raw `<img>`** for feed photos
   (`FeedView`), the celebrate photo (`CelebrateView`), and recap frames rather
   than `next/image` — see the `buildRemotePatterns()` note in
   `apps/web/next.config.mjs`.

Net: putting Azure Front Door / Azure CDN in front of today's SAS URLs would add
a hop and cost while caching essentially nothing. **A CDN is only worthwhile
AFTER** hot/public media moves to **stable public URLs** (next section).

## next/image configuration (present + future)

`apps/web/next.config.mjs` already configures the Next image optimizer, but it is
**not exercised by today's media** (which stays on raw `<img>`, above). The config
is staged for the future migration:

- `formats: ["image/avif", "image/webp"]` — modern formats, negotiated per the
  browser `Accept` header with automatic fallback.
- `remotePatterns` — built by `buildRemotePatterns()`, which derives allowed
  origins from `S3_PUBLIC_URL`, then `S3_ENDPOINT`, plus the localhost MinIO
  default for dev. This allow-list exists so that **once** public media is served
  from a stable host (a Front Door/CDN endpoint or a public Blob URL),
  `next/image` can be re-enabled by pointing that env at the host — no further
  code change.
- `deviceSizes` / `imageSizes` — responsive breakpoints for `srcset`.
- `minimumCacheTTL` — 24h cache for optimizer outputs at the Next layer.

> Note: `S3_PUBLIC_URL` / `S3_ENDPOINT` are the **S3/MinIO** knobs (the local-dev
> / fallback backend, see below). The production Azure backend serves via SAS and
> does not use them today; they become relevant again only if/when public media
> is fronted by a stable host that the optimizer should be pointed at.

## Future enhancement: Azure Front Door / Azure CDN

> **This is a future enhancement with prerequisites — NOT a current TODO.** It is
> only worth doing once hot/public media (feed photos, public share-page images)
> is moved off short-lived SAS URLs and onto **stable, public** URLs.

The Azure-native path (use these, **not** AWS CloudFront):

- **Azure Front Door** (Standard/Premium) in front of the storage account —
  global edge caching, TLS, compression, HTTP/2/3, and a custom domain. Premium
  can reach a private origin via **Private Link**; Standard fronts a
  public-readable origin.
- **Azure CDN** as a lighter-weight alternative for straightforward edge caching
  of public Blob content.

### Prerequisites (what must change first)

1. **A public-URL strategy for public media.** Today the container is `private`
   and `allow_nested_items_to_be_public = false`. To cache at the edge you need
   stable, non-signed URLs for the **public** subset — e.g. a public-readable
   container (or public blob access) **scoped to feed/share-page images only**,
   or an equivalent public-URL scheme — while keeping all **private** media
   (PRIVATE/FOLLOWERS recaps, etc.) on the existing SAS path. Do **not** make the
   current private container world-readable: that would break the access-control
   model and the GDPR hard-erase posture documented in `infra/azure/main.tf`.
2. **Public-media `Cache-Control` becomes `public`.** Only for the genuinely
   public objects — so the edge may cache them. Private media keeps `private`.
3. **Front Door / Azure CDN** in front of the storage account, honoring origin
   `Cache-Control`, with compression and a custom domain + managed cert.
4. **Re-enable `next/image`** for the migrated media: point the optimizer's
   allow-list at the public host (the existing `images` config in
   `apps/web/next.config.mjs` already covers this once the host is known) and
   switch `FeedView` / `CelebrateView` to `next/image` with explicit dimensions.

Only after (1)–(2) do the SAS-driven blockers above disappear and a CDN start
paying for itself.

## S3 / MinIO is the local-dev / fallback backend only

`apps/web/lib/storage.ts` keeps an **S3-compatible** code path (the `@aws-sdk`
client, `S3_ENDPOINT` / `S3_PUBLIC_URL` / `S3_BUCKET` env). In this deployment
that path is **not** the production backend — it is the **local-dev / CI**
backend (**MinIO**) and a generic S3/AWS fallback. Production runs the **Azure
Blob** path (managed-identity user-delegation SAS), selected at runtime by the
`AZURE_STORAGE_*` env wired in `infra/azure/main.tf`.

Any AWS-specific CDN guidance (CloudFront, Origin Access Control, S3 bucket
origins) is therefore **not applicable to this deployment**. If you operate the
S3/MinIO fallback in some other environment, front it with that provider's CDN as
you would any S3 bucket — but for Project 50's Azure deployment, follow the
Azure-native path above.

## See also

- [`OBJECT-STORAGE.md`](./OBJECT-STORAGE.md) — provisioning the storage backend
  and the presign upload/download flow.
- [`DOMAIN-TLS.md`](./DOMAIN-TLS.md) — custom domains / managed certs (a CDN
  custom domain would build on the same DNS/cert posture).
- `apps/web/lib/storage.ts` — `presignGet` / `presignPut` / `putObject` and the
  `IMMUTABLE_CACHE_CONTROL` rationale.
- `infra/azure/main.tf` — `azurerm_storage_account.media` (private container,
  managed-identity access, no CDN).
- `apps/web/next.config.mjs` — `images` config + the raw-`<img>` rationale.
</content>
</invoke>
