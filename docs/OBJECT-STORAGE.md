# Object storage

How Project 50 stores user-generated media (activity photos, rendered recap
MP4s). This is the durable store behind `apps/web/lib/storage.ts` and the
presign upload/download flow. The backend is **selected at runtime by env**
(`apps/web/lib/storage.ts`): when `AZURE_STORAGE_ACCOUNT` /
`AZURE_STORAGE_CONTAINER` are set it uses **Azure Blob**; otherwise it falls
back to the **S3/MinIO** code path. **No code change** between local and prod.

- **Production (Azure):** **Azure Blob Storage** — a single **private** container
  on the `azurerm_storage_account.media` account, accessed via the app's
  **managed identity** (user-delegation SAS, **no account key in prod**). This is
  the real production backend; see [Azure Blob (production)](#azure-blob-production).
- **Dev / CI:** **MinIO** (Docker Compose) with default `minioadmin` creds, via
  the S3-compatible path.
- **S3 / Cloudflare R2 / self-hosted MinIO:** a generic S3-compatible **fallback**
  backend for non-Azure environments — *not* the Project 50 production stack. See
  [S3 / MinIO (dev + non-Azure fallback)](#s3--minio-dev--non-azure-fallback).

Read alongside [`CDN.md`](./CDN.md) (media delivery — the production backend is
Azure Blob via short-lived SAS URLs, and there is **no CDN today**),
[`infra/azure/README.md`](../infra/azure/README.md) (the storage account,
soft-delete-off / GDPR hard-erase, Container Apps), [`BACKUPS.md`](./BACKUPS.md)
(media backup), [`SECRETS.md`](./SECRETS.md) (the `S3_*` dev vars + Azure env)
and [`RUNBOOKS.md`](./RUNBOOKS.md) (storage-down runbook).

## Azure Blob (production)

In the Azure deployment, media lives in **Azure Blob Storage** on the
`azurerm_storage_account.media` account (`stp50mediazv34o5`, LRS, TLS 1.2) in a
single **private** container. The authoritative infra description is
[`infra/azure/README.md`](../infra/azure/README.md) (Object storage; Custom
domain & TLS; Scaling) and `infra/azure/main.tf` — this section mirrors it.

- **Private container, no anonymous access.** The container is
  `container_access_type = "private"` and the account sets
  `allow_nested_items_to_be_public = false` — blobs are **never** anonymously
  readable. The signed SAS URL is the only way in.
- **Managed-identity, no account key.** In production the app holds **no storage
  account key**. It mints SAS URLs by first fetching a short-lived
  **user-delegation key** (`getUserDelegationKey()`, cached ~1h) with its
  **managed identity** (`uami-project50-dev`), then signing per-blob SAS:
  - **Download/view:** `presignGet()` → a **5-min** SAS **GET** URL scoped to one
    blob; the browser fetches directly from `*.blob.core.windows.net`.
  - **Upload:** `presignPut()` → a **5-min** SAS `racw` **PUT** URL; the browser
    `PUT`s the bytes directly (they never transit the app server).
- **Immutable `private` Cache-Control.** Uploaded objects carry
  `Cache-Control: private, max-age=31536000, immutable` (the
  `IMMUTABLE_CACHE_CONTROL` constant). Content-addressed keys never change, so the
  **browser** caches for a year, while **`private`** forbids shared/edge caches and
  CDNs from retaining a signed URL past its 5-min expiry. See [`CDN.md`](./CDN.md)
  for the full rationale (and why there is no CDN today).
- **Soft delete is OFF (GDPR hard-erase).** Account deletion must **permanently**
  erase a user's media, so blob **soft delete stays DISABLED** on the media
  account — otherwise a deleted blob is recoverable and the GDPR erasure contract
  (`deleteUserMedia` in `apps/web/lib/storage.ts`) is silently broken. This is
  enforced by **omission** in `main.tf` (no `delete_retention_policy` /
  `container_delete_retention_policy`), so it can't be asserted by Terraform —
  **verify it at the data plane after every `terraform apply`**:

  ```bash
  SA="$(terraform output -raw storage_account_name)"   # e.g. stp50mediazv34o5
  az storage account blob-service-properties show --account-name "$SA" \
    --query 'deleteRetentionPolicy.enabled'            # expect: false (or null)
  az storage account blob-service-properties show --account-name "$SA" \
    --query 'containerDeleteRetentionPolicy.enabled'   # expect: false (or null)
  ```

  If either returns `true`, soft delete was enabled out-of-band — disable it
  before going live. Full runbook in [`infra/azure/README.md`](../infra/azure/README.md)
  (§ *Verify blob soft delete is OFF*).
- **CORS** for the direct-browser-PUT flow is codified in Terraform on the storage
  account for `https://www.project50.fit` — see [CORS](#cors--direct-browser-put-uploads).

**Provisioning** the Azure storage account, container, managed-identity grant, and
CORS is all in **Terraform** (`infra/azure`), applied locally per the deploy
runbook in [`infra/azure/README.md`](../infra/azure/README.md). There is **no
manual bucket/IAM provisioning** for the Azure backend — the S3 steps below are
for the dev/fallback path only.

## S3 / MinIO (dev + non-Azure fallback)

> The rest of this document covers the **S3-compatible fallback** backend
> (`apps/web/lib/storage.ts`'s `@aws-sdk/client-s3` path): **MinIO** for local
> dev / CI, and AWS S3 / Cloudflare R2 / self-hosted MinIO for any **non-Azure**
> environment. **This is NOT the Project 50 production stack** (that is Azure Blob,
> above). The presign flow and key layout are shared, but the prod provisioning is
> Terraform on Azure, not the manual bucket/IAM steps here.

> **TODO (non-Azure only):** the bucket / IAM steps below are marked **TODO** —
> they apply only if you run the S3/MinIO fallback in a non-Azure environment.

## How the app uses storage

`apps/web/lib/storage.ts` (an `@aws-sdk/client-s3` client, `forcePathStyle:true`):

- **Upload:** `POST /api/uploads/presign` returns a **presigned PUT** URL
  (5-min expiry); the browser uploads the bytes **directly** to the bucket — they
  never transit the app server. Requires **bucket CORS** allowing browser `PUT`.
- **Download/view:** `presignGet()` mints a **presigned GET** URL (5-min) for
  private objects (a Blob SAS GET URL on Azure; an S3 presigned GET on the
  fallback). There is **no CDN today** — see [`CDN.md`](./CDN.md).
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
| `S3_PUBLIC_URL` | Public base URL for serving media; falls back to `S3_ENDPOINT`. Drives `next.config.mjs` `images.remotePatterns` + the CSP when set. | _(unset)_ | _(unset — no CDN today)_ |

These are the **S3/MinIO fallback** knobs. `S3_ACCESS_KEY` / `S3_SECRET_KEY` are
**secrets** (rotate as a pair — see `SECRETS.md`); `S3_ENDPOINT` / `S3_BUCKET` /
`S3_PUBLIC_URL` are plain config. **The Azure production backend does not use any
of them** — it selects on `AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_CONTAINER` and
serves via per-request SAS GET URLs (no public base URL / CDN). See
[`SECRETS.md`](./SECRETS.md) for the Azure env wiring.

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

The presigned-PUT flow uploads from the browser straight to the store, so it must
allow cross-origin `PUT` from the app's web origin.

**Azure (production):** CORS on the storage account is **codified in Terraform**
(`infra/azure`) for the canonical web origin **`https://www.project50.fit`** — it
is not configured by hand. If you move the canonical host (see
[`DOMAIN-TLS.md`](./DOMAIN-TLS.md)), update the Terraform CORS rule to match.

**S3/MinIO fallback:** apply equivalent CORS on the bucket so the browser can
`PUT` directly, scoped to the real web origin(s) — for the Project 50 canonical
host that is `https://www.project50.fit`:

```json
[
  {
    "AllowedOrigins": [
      "https://www.project50.fit"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- Replace/extend the origins with your real web/staging origins (add a preview
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

## Media delivery (no CDN today)

There is **no CDN in this deployment**. Media is delivered via short-lived,
per-request **SAS GET URLs** (Azure) or **presigned GET URLs** (S3 fallback) — see
[`CDN.md`](./CDN.md) for why a CDN in front of signed, 5-min-expiry URLs buys
almost nothing today, and the Azure-native (Front Door / Azure CDN, **not**
CloudFront) path to add one *later* once hot/public media moves to stable public
URLs. The objects' `private, max-age=…, immutable` Cache-Control is browser-
cacheable but CDN-hostile by design.

## TODO (non-Azure fallback only)

> The Azure production storage is provisioned by **Terraform** (`infra/azure`) — no
> manual steps. The checklist below applies only if you run the **S3/MinIO
> fallback** in a non-Azure environment.

- [ ] **Create** the media bucket (`project50-media-prod`) — private, versioned,
      default-encrypted. **(requires cloud account / IAM)**
- [ ] **Create** the offsite **backup** bucket(s) (`BACKUPS.md`), ideally
      cross-region / cross-account.
- [ ] Apply the **CORS**, **bucket policy**, and **lifecycle** configs above.
- [ ] Create the **least-privilege IAM credential** for the app; set
      `S3_ACCESS_KEY`/`S3_SECRET_KEY` in the secret store (`SECRETS.md`).
- [ ] Verify end-to-end: upload a photo in the app, confirm the object lands in
      the bucket and `/api/ready` reports `storage:true` (`RUNBOOKS.md`).
