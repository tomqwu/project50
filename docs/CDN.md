# Media CDN & Image Optimization

Project 50 stores user-generated media (activity photos, rendered recap MP4s)
in S3-compatible object storage: **MinIO** in dev/staging, **AWS S3** in
production. This document describes how a CDN sits in front of that storage,
how images are optimized, and the environment wiring that ties it together.

## TL;DR

- Put a CDN (CloudFront or Cloudflare) in front of the object-storage bucket.
- Point `S3_PUBLIC_URL` at the **CDN origin** (not the bucket/MinIO endpoint).
- Ensure `apps/web/next.config.mjs` `images.remotePatterns` includes the CDN
  host — it is derived automatically from `S3_PUBLIC_URL` / `S3_ENDPOINT`.
- Set long-lived `Cache-Control` on stored objects so the CDN caches them.

## Architecture

```
browser ──▶ CDN (CloudFront / Cloudflare) ──▶ S3 bucket (origin)
              │  edge cache, TLS, compression
              ▼
        cache-control honored from object metadata
```

The Next.js app never proxies durable media bytes through itself. Media is
served directly from the CDN edge. The app only mints **presigned URLs**
(short-lived, signed GET URLs) for private objects — see below.

## Environment wiring

| Variable        | Dev (MinIO)              | Prod (S3 + CDN)                          |
| --------------- | ------------------------ | ---------------------------------------- |
| `S3_ENDPOINT`   | `http://localhost:9000`  | S3 regional endpoint (internal writes)   |
| `S3_PUBLIC_URL` | _(unset → endpoint)_     | `https://cdn.project50.app` (CDN origin) |
| `S3_BUCKET`     | `project50-media`        | `project50-media-prod`                   |

`S3_PUBLIC_URL` is the public base URL used when serving stored media; it falls
back to `S3_ENDPOINT` when unset (see `.env.example` and `lib/storage.ts`).
**In production it must point at the CDN**, so public media URLs resolve to the
cached edge rather than the bucket directly.

## next/image configuration

`apps/web/next.config.mjs` configures the Next image optimizer:

- `formats: ["image/avif", "image/webp"]` — modern formats, negotiated per the
  browser `Accept` header with automatic fallback.
- `remotePatterns` — built by `buildRemotePatterns()`, which derives allowed
  origins from `S3_PUBLIC_URL`, then `S3_ENDPOINT`, plus the localhost MinIO
  default for dev. **Because the CDN host comes from `S3_PUBLIC_URL`, simply
  pointing that env var at the CDN automatically allow-lists it for
  `next/image` — no code change required.**
- `deviceSizes` / `imageSizes` — responsive breakpoints for `srcset`.
- `minimumCacheTTL` — 24h cache for optimizer outputs at the Next layer; the
  CDN provides the durable edge cache.

### Why current media still uses raw `<img>` (not `next/image`)

The media rendered today — feed photos (`FeedView`), the celebrate photo
(`CelebrateView`), recap frames — is served via **presigned GET URLs**:
short-lived (5 minutes), query-signed URLs minted by `presignGet()` in
`lib/storage.ts` (see `lib/api/media.ts`, `lib/api/recap.ts`).

Presigned URLs are a poor fit for `next/image`:

1. **Cache-key churn.** The signature query string changes on every render, so
   the optimizer's cache key never stabilizes — it would re-fetch and
   re-encode the same image on every request, adding latency and compute with
   no caching benefit.
2. **Expiry.** The URLs expire in 5 minutes; an optimized image cached against
   one signature points at an upstream that quickly 403s.
3. **Layout.** `next/image` requires intrinsic `width`/`height` or `fill`; the
   current photos use CSS `object-fit` without fixed intrinsic dimensions.

So those components intentionally keep raw `<img>`. Optimization and caching
for that media is handled at the **CDN/object-storage layer** (formats and
cache-control on the stored object), not by the Next optimizer.

`next/image` becomes the right tool once media is served from **stable, public
(non-signed) CDN URLs**. At that point the `remotePatterns` allow-list above
already covers the CDN host, and components can switch to `next/image` with
explicit dimensions.

## Cache-Control for media

Stored media objects should carry a long-lived, immutable cache policy so the
CDN and browsers cache aggressively. Keys are content-addressed
(`media/<userId>/<suffix>.<ext>` — see `newMediaKey()`), so objects are
effectively immutable:

```
Cache-Control: public, max-age=31536000, immutable
```

Set this as object metadata at upload time (server-side `putObject`) or via a
bucket/CDN default response-header policy. For **presigned-URL** delivery the
header is still honored by the browser, but the CDN cannot cache signed
responses (the signature makes each URL unique) — another reason public CDN
URLs are preferred for hot media.

## Setting up the CDN

### CloudFront (AWS)

1. Create a CloudFront distribution with the S3 bucket as origin (use Origin
   Access Control so the bucket stays private to the world but readable by
   CloudFront).
2. Attach a cache policy with a long default TTL; honor `Cache-Control` from
   the origin.
3. Enable Brotli/Gzip compression and HTTP/2/3.
4. Use a custom domain (e.g. `cdn.project50.app`) with an ACM cert.
5. Set `S3_PUBLIC_URL=https://cdn.project50.app`.

### Cloudflare

1. Put the bucket behind Cloudflare (proxied DNS record / R2 + custom domain).
2. Create a cache rule for the media path with "Cache Everything" and respect
   origin `Cache-Control`.
3. Optionally enable Polish/Mirage for additional image optimization at the
   edge.
4. Set `S3_PUBLIC_URL` to the Cloudflare-fronted hostname.

## TODO (cloud-account steps)

- [ ] **Provision the CDN distribution** (CloudFront or Cloudflare) against the
      production media bucket — requires the cloud account / IAM, not yet done.
- [ ] Issue/attach the TLS cert for the CDN custom domain.
- [ ] Set production `S3_PUBLIC_URL` to the CDN origin.
- [ ] Apply the `Cache-Control: public, max-age=31536000, immutable` default
      response-header policy (or set it on `putObject` uploads).
- [ ] (Future) Migrate hot media from presigned URLs to public CDN URLs and
      switch `FeedView` / `CelebrateView` to `next/image`.
