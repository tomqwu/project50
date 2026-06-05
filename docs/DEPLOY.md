# Deployment

How the **web app** (`apps/web`, a Next.js app) gets to production, plus how DB
migrations run on release.

> **Canonical runbook:** the full, step-by-step deploy procedure (with the exact
> commands, the one-time secrets-state migration, scaling, object storage, and
> Key Vault) lives in [`infra/azure/README.md`](../infra/azure/README.md). This
> file is the **model overview**; it points at that runbook rather than
> duplicating it. When the two disagree, `infra/azure/README.md` wins.

## The model: local, gated, IaC (no CI/CD pipeline)

The app runs on **Azure Container Apps** (`ca-project50-web-dev`, Canada
Central), fronted by the custom domain **`https://www.project50.fit`**. There is
**no GitHub OIDC continuous deployment** — deploys are run **locally** from an
`az login` session, gated on:

1. **CI green** on the merge commit,
2. **merged to `main`**, and
3. a **CalVer release tag** cut for the commit.

`.github/workflows/release.yml` auto-cuts a CalVer tag `vYYYY.MM.DD.N` + a
GitHub release on every green merge to `main` (that tag feeds the in-app
`ReleaseBadge` and the deploy below — it does **not** deploy anything).

> **`.github/workflows/deploy.yml` is INERT.** It is a leftover Vercel scaffold
> (a `migrate` job + an `amondnet/vercel-action` `deploy` job, gated behind a
> `preflight` secret check). The repo has **no `VERCEL_*` secrets** and **no
> `DATABASE_URL` Actions secret**, so every job resolves to *skipped* (not
> failed) and **nothing is deployed by GitHub Actions**. We do not use Vercel.
> Treat `deploy.yml`/`preview.yml` as dormant; the real deploy is the local
> Azure flow below.

## TL;DR — deploy after a release

Run from the repo root in an `az login` shell (full version in
[`infra/azure/README.md`](../infra/azure/README.md) § *Deploy runbook*):

```bash
TAG=v2026.06.04.3                          # the cut CalVer release (badge only)
IMAGE_SHA=$(git rev-parse --short=7 HEAD)  # the IMAGE tag == terraform image_tag

# 1. Build the image IN ACR by commit sha (builds linux/amd64 natively; a local
#    docker build under arm64 emulation fails). The CalVer tag rides in as a
#    --build-arg for the footer ReleaseBadge (release-build-args.sh).
BUILD_ARGS=$(bash scripts/release-build-args.sh "$TAG") \
  || { echo "release-build-args failed (HEAD not at $TAG?)"; exit 1; }
eval "az acr build --registry acralztyhlgn6o --image project50-web:$IMAGE_SHA \
  --platform linux/amd64 --file apps/web/Dockerfile $BUILD_ARGS ."

# 2. Migrate FIRST (admin URL read from Key Vault), so the new revision never
#    serves traffic against the old schema. See the runbook for the firewall +
#    admin-URL steps.

# 3. Switch the Container App to the new image (no secret VALUES pass through TF).
cd infra/azure
terraform plan  -var "image_tag=$IMAGE_SHA"   # review for unexpected destroys
terraform apply -var "image_tag=$IMAGE_SHA"

# 4. Roll a fresh revision onto the new image.
az containerapp update -g rg-project50-dev-canadacentral -n ca-project50-web-dev \
  --revision-suffix "rel$(date +%Y%m%d%H%M)"
```

Two distinct identifiers, kept straight: **`IMAGE_SHA`** = the commit sha = the
image tag = `terraform -var image_tag`; **`TAG`** = the CalVer release, used only
for the footer release badge (a `--build-arg`, never the image tag).

## Key facts

- **Build by commit sha in ACR:** `az acr build --registry acralztyhlgn6o
  --image project50-web:<sha> ...`. The image Terraform pulls (`image_tag=<sha>`)
  is exactly the image you built. `az acr build` builds `linux/amd64` natively;
  a local `docker build` under arm64 emulation fails.
- **`auth_url` now defaults to `https://www.project50.fit`** (the canonical host;
  the apex `project50.fit` 301-redirects to `www`, and OAuth callbacks are
  registered for `www`). So a routine `terraform apply -var image_tag=...`
  **without** an `auth_url` override is correct — do not pass the apex.
- **Migrations run before the image switch.** `prisma migrate deploy`
  (forward-only, idempotent) is run as the DB admin **before** `terraform apply`
  flips the image, so the new revision never serves traffic against an
  un-migrated schema. Write migrations backward-compatible (expand → migrate →
  contract).
- **Always roll a fresh revision** after a deploy
  (`az containerapp update --revision-suffix ...`). Container Apps caches
  **versionless** Key Vault secret refs (~30 min), so a fresh revision is what
  picks up rotated secrets immediately. Likewise build with no stale layers
  (`--no-cache` if a rebuild would reuse a cached `NEXT_PUBLIC_RELEASE_*` layer)
  so the release-badge env isn't baked stale — a stale deployed image is the #1
  "works locally but not online" cause.
- **CalVer release per merge:** one `vYYYY.MM.DD.N` tag + GitHub release per
  green merge to `main` (`release.yml`); the badge links the deployed
  tag/sha/time.
- **No secret values in TF state.** The Container App references Key Vault
  secrets by **versionless URI**; values are set out of band with
  `az keyvault secret set`. There is a **one-time secrets-state migration**
  (`terraform state rm` of three former `azurerm_key_vault_secret` resources)
  that **must run before the first `terraform apply` with the current code**, or
  the apply will plan to DELETE the live `database-url` / `database-url-admin` /
  `auth-secret` secrets and take down the app. That procedure (and the
  state-history scrub) is documented in
  [`infra/azure/README.md`](../infra/azure/README.md) — do it first.

## Migrate-on-release

`prisma migrate deploy` applies only **pending** migrations and is a no-op when
the schema is up to date, so re-runs are safe. It is **forward-only** — there is
no automatic down-migration. To revert a schema change, author a new forward
migration and ship it through the same deploy. This forward-only history is why
the app can always be rolled back (revision rollback, below) without a matching
DB rollback. See [`infra/azure/README.md`](../infra/azure/README.md) for the
exact migrate step (admin URL from Key Vault, temp Postgres firewall rule).

## Rollback

- **App rollback = Container App revision rollback.** Each deploy creates a new
  Container App revision; the previous good revision is still there. Shift
  ingress traffic back to it (instant, does **not** touch the DB):

  ```bash
  RG=rg-project50-dev-canadacentral; APP=ca-project50-web-dev
  az containerapp revision list -g "$RG" -n "$APP" -o table   # find last-good
  az containerapp ingress traffic set -g "$RG" -n "$APP" \
    --revision-weight <last-good-revision>=100
  ```

  See [`RUNBOOKS.md`](./RUNBOOKS.md) → *Bad deploy / rollback* for the full lever
  (activate/restart a revision, 100% traffic shift).
- **Database rollback:** forward-only — ship a new forward migration that undoes
  the change. Never hand-edit `_prisma_migrations`.
- **Bad migration:** because migrations run **before** the image switch, a failed
  migration aborts the deploy and the live revision keeps serving the old
  schema. Fix the migration forward and re-run.

## Scaling

The Container App keeps **`min_replicas = 1`** (one warm replica 24/7) and scales
out to **`max_replicas = 4`** under HTTP-concurrency load, so there is **no cold
start** on the first request after idle. Health probes target `/api/health`
(startup/liveness, dependency-free) and `/api/ready` (readiness, checks
DB + Blob). Details and the scale-to-zero opt-out (`-var min_replicas=0`) are in
[`infra/azure/README.md`](../infra/azure/README.md) § *Scaling*.
