# Production object storage

How to provision the **S3-compatible** object storage that Project 50 uses for
user-generated media (activity photos, rendered recap MP4s). This is the durable
store behind `apps/web/lib/storage.ts` and the presign upload/download flow.

- **Dev / CI:** **MinIO** (Docker Compose) with default `minioadmin` creds.
- **Production:** **AWS S3**, **Cloudflare R2**, or self-hosted **MinIO** — any
  S3-compatible endpoint. The app code is provider-agnostic.

Read alongside [`CDN.md`](./CDN.md) (media delivery — note the **production
backend is Azure Blob via short-lived SAS URLs**, and there is **no CDN today**;
this S3/MinIO path is the local-dev / fallback backend),
[`BACKUPS.md`](./BACKUPS.md) (mirroring media to a backup bucket),
[`SECRETS.md`](./SECRETS.md) (the `S3_*` env vars + rotation) and
[`RUNBOOKS.md`](./RUNBOOKS.md) (storage-down runbook).

> **TODO (your cloud account):** every step that creates a real bucket / IAM
> credential is marked **TODO** — it needs the production cloud account and is
> not yet provisioned. The app, env wiring, and presign flow already exist.

## How the app uses storage

`apps/web/lib/storage.ts` (an `@aws-sdk/client-s3` client, `forcePathStyle:true`):

- **Upload:** `POST /api/uploads/presign` returns a **presigned PUT** URL
  (5-min expiry); the browser uploads the bytes **directly** to the bucket — they
  never transit the app server. Requires **bucket CORS** allowing browser `PUT`.
- **Download/view:** `presignGet()` mints a **presigned GET** URL (5-min) for
  private objects. Public/hot media is served via the **CDN** (`CDN.md`).
- **Recap:** the server writes MP4s with `putObject` (`lib/api/recap.ts`).
- **Readiness:** `/api/ready` does a `HeadBucket` on `S3_BUCKET`.
- **Self-heal:** `ensureBucket()` creates `S3_BUCKET` if missing (needs
  `CreateBucket`/`HeadBucket` perms). In prod, prefer to **pre-create** the
  bucket and grant least-privilege perms instead of relying on self-heal.

Keys are content-addressed and effectively immutable:
`media/<userId>/<suffix>.<ext>` (`newMediaKey()`).

## Environment variables

| Variable | Meaning | Dev (MinIO) | Prod |
| --- | --- | --- | --- |
| `S3_ENDPOINT` | S3 API endpoint (writes/presign) | `http://localhost:9000` | regional S3 endpoint / R2 endpoint |
| `S3_ACCESS_KEY` | Access key id | `minioadmin` | IAM/R2 key (**secret**) |
| `S3_SECRET_KEY` | Secret key | `minioadmin` | IAM/R2 secret (**secret**) |
| `S3_BUCKET` | Bucket name | `project50-media` | `project50-media-prod` |
| `S3_PUBLIC_URL` | Public base URL for serving media; falls back to `S3_ENDPOINT` | _(unset)_ | **CDN origin** (see `CDN.md`) |

`S3_ACCESS_KEY` / `S3_SECRET_KEY` are **secrets** (rotate as a pair — see
`SECRETS.md`). `S3_ENDPOINT` / `S3_BUCKET` / `S3_PUBLIC_URL` are plain config.
**In prod, `S3_PUBLIC_URL` must point at the CDN**, not the bucket endpoint.

## Provisioning

### Option A — AWS S3 (+ CloudFront, see CDN.md)

1. **Create the bucket** (`project50-media-prod`) in your region. **TODO.**
2. **Block all public access** (private bucket — access is via presigned URLs
   and the CDN's Origin Access Control). **TODO.**
3. **Enable default encryption** (SSE-S3, or SSE-KMS with a dedicated key).
4. **Enable versioning** (recover from overwrite/delete; pairs with lifecycle).
5. Apply the **CORS** config (below) so the browser can `PUT` directly.
6. Apply the **lifecycle** rules (below).
7. **Create a least-privilege IAM user/role** for the app (policy below); put its
   keys in `S3_ACCESS_KEY`/`S3_SECRET_KEY`. **TODO.**
8. Front it with a CDN and set `S3_PUBLIC_URL` to the CDN origin — see `CDN.md`.

### Option B — Cloudflare R2

1. Create an R2 bucket; note the **S3 API endpoint**
   `https://<account>.r2.cloudflarestorage.com`. **TODO.**
2. Create an **R2 API token** (Object Read & Write, scoped to the bucket) →
   `S3_ACCESS_KEY`/`S3_SECRET_KEY`; set `S3_ENDPOINT` to the R2 endpoint.
3. Enable **versioning**; apply **CORS** (below).
4. Attach a **custom domain** (R2's built-in CDN) and set `S3_PUBLIC_URL` to it
   (see `CDN.md`). Keep the bucket otherwise private.

### Option C — self-hosted MinIO (prod-ish / on-prem)

1. Deploy MinIO with **TLS** and non-default root creds. **TODO.**
2. `mc mb project50-media-prod`; create a **scoped service account** for the app.
3. Set the bucket policy private; apply CORS via `mc admin`/console.
4. Front with a CDN/reverse proxy and set `S3_PUBLIC_URL`.

## Bucket policy — private, presigned access only

The bucket holds user PII (photos) and must **never** be world-readable. The app
grants time-limited access via **presigned URLs**; the CDN reads the origin via
**Origin Access Control** (CloudFront) or a proxied custom domain (R2/CF).

**Least-privilege IAM policy for the app identity** (S3) — read/write objects in
the bucket, **delete objects (incl. all versions) for GDPR account-deletion
erasure**, plus `HeadBucket` for the readiness check (drop `CreateBucket` once
the bucket is pre-created):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AppObjectRWDelete",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::project50-media-prod/*"
    },
    {
      "Sid": "AppBucketHeadAndListVersions",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:ListBucketVersions"],
      "Resource": "arn:aws:s3:::project50-media-prod"
    }
  ]
}
```

> `HeadBucket` is authorized by `s3:ListBucket` on the bucket ARN. If you keep
> `ensureBucket()` self-heal, also grant `s3:CreateBucket`; pre-creating the
> bucket is preferred so you can drop it.
>
> **The delete + version permissions are REQUIRED for GDPR account-deletion
> erasure** (`deleteUserMedia` / `deleteObject` in `apps/web/lib/storage.ts`).
> On a versioned bucket (recommended below), the app enumerates object versions
> via **`s3:ListBucketVersions`** and removes every version + delete marker via
> **`s3:DeleteObjectVersion`** (plus **`s3:DeleteObject`** for the current
> object); `s3:GetObject`/`s3:PutObject`/`s3:ListBucket` alone are not enough.
> Omitting them does **not** surface as a hard error — account deletion logs the
> AccessDenied and still completes — so the user's media would silently survive,
> breaking the erasure promise. Do not drop them.

## CORS — direct browser PUT uploads

The presigned-PUT flow uploads from the browser straight to the bucket, so the
bucket must allow cross-origin `PUT` from the app's web origin(s):

```json
[
  {
    "AllowedOrigins": [
      "https://project50.app",
      "https://www.project50.app"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- Replace the origins with your real web/staging domains (add the preview-deploy
  origin if you upload from previews). Avoid `"*"` in production.
- `PUT` is for the presigned upload; `GET`/`HEAD` cover presigned reads /
  readiness from the browser where applicable.

## Lifecycle rules

Apply lifecycle on the **media** bucket (housekeeping) and, separately, the
**backup** bucket (retention — see `BACKUPS.md`).

**Media bucket** — clean up incomplete multipart uploads and (if versioning is
on) expire noncurrent versions so storage doesn't grow unbounded:

```json
{
  "Rules": [
    {
      "ID": "abort-incomplete-mpu",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    },
    {
      "ID": "expire-noncurrent-media",
      "Status": "Enabled",
      "Filter": { "Prefix": "media/" },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
    }
  ]
}
```

**Backup bucket** — enforce the retention from `BACKUPS.md` (30 daily, then a
monthly tier transitioned to cheaper/cold storage):

```json
{
  "Rules": [
    {
      "ID": "pg-daily-retention",
      "Status": "Enabled",
      "Filter": { "Prefix": "pg/" },
      "Transitions": [{ "Days": 30, "StorageClass": "STANDARD_IA" }],
      "Expiration": { "Days": 400 }
    }
  ]
}
```

> Tune the prefixes/classes to your provider (R2 has no storage-class tiers; use
> a separate cold bucket or skip the transition). These are starting points.

## CDN tie-in

Public/hot media is served from a **CDN** in front of this bucket, not from the
bucket directly. Point `S3_PUBLIC_URL` at the **CDN origin** and set a long-lived
`Cache-Control` on objects. The full CDN setup (CloudFront OAC / Cloudflare cache
rules, `next/image` allow-listing, cache headers) lives in **[`CDN.md`](./CDN.md)** —
do not duplicate it here.

## TODO (cloud-account steps)

- [ ] **Create** the production media bucket (`project50-media-prod`) — private,
      versioned, default-encrypted. **(requires cloud account / IAM)**
- [ ] **Create** the offsite **backup** bucket(s) (`BACKUPS.md`), ideally
      cross-region / cross-account.
- [ ] Apply the **CORS**, **bucket policy**, and **lifecycle** configs above.
- [ ] Create the **least-privilege IAM credential** for the app; set
      `S3_ACCESS_KEY`/`S3_SECRET_KEY` in the secret store (`SECRETS.md`).
- [ ] Provision the **CDN** and set `S3_PUBLIC_URL` to its origin (`CDN.md`).
- [ ] Verify end-to-end: upload a photo in the app, confirm the object lands in
      the bucket and `/api/ready` reports `storage:true` (`RUNBOOKS.md`).
