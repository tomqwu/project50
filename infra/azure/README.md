# Azure deployment — project50-web

Deploys the web app to **Azure Container Apps** (min 1 warm replica, scales out
under load) on the cloud landing zone, with **Postgres Flexible Server** (B1ms)
and **Blob storage** for media. Extends the landing-pad onboarding (same
Terraform state, `apps/project50.tfstate`).

## What it creates (in `rg-project50-dev-canadacentral`)

| Resource | Notes | ~Cost |
| --- | --- | --- |
| Postgres Flexible Server B1ms + `project50` db | burstable, public endpoint + SSL | ~$13/mo |
| Storage account + `media` container | LRS, TLS1.2, private (SAS URLs) | pennies |
| Container Apps Environment | logs → platform LAW | $0 |
| Container App `ca-project50-web-dev` | min 1 / max 4 replicas (0.5 vCPU + 1Gi each), image from ACR, secrets from Key Vault | ~$0 idle scale-to-zero **or** one warm replica 24/7 (see Scaling) |

The app's managed identity (`uami-project50-dev`, from onboard) pulls the image
(AcrPull) and reads the Key Vault secrets (Key Vault Secrets User).

## Scaling (warm baseline → scales out)

The Container App keeps **`min_replicas = 1`** so one small replica stays warm at
all times — the first request after an idle period skips the multi-second Next.js
cold start. Under concurrent load it **scales out** toward **`max_replicas = 4`**,
then back to 1 when traffic subsides.

- **Scale rule** — an HTTP concurrency rule (`http_scale_rule`) targets **80
  concurrent requests per replica**: KEDA adds replicas as in-flight requests
  climb past that, and removes them as they fall.
- **Per-replica resources** — `cpu = 0.5` / `memory = 1Gi`, kept deliberately
  minimal. We scale OUT (more replicas), not down per replica; 0.25 vCPU / 0.5Gi
  risks OOM for the Next standalone server, so don't shrink it.
- **Health probes** (port 3000) — because a warm replica is always in the
  routing pool: `startup_probe` and `liveness_probe` hit `/api/health` (a static,
  dependency-free check — a startup probe failure kills the revision, so it must
  not depend on Postgres/Blob), while `readiness_probe` hits `/api/ready` (checks
  the deps and withholds traffic from a not-yet-ready replica without restarting
  it). So a still-booting or wedged replica is kept out of / restarted in the
  ingress rotation.
- **Cost tradeoff** — at min 1 that one replica runs **24/7** (~0.5 vCPU + 1Gi),
  billing active-usage rates against the Azure Sponsorship credits instead of
  going to $0 at idle. The warm-baseline cost buys away the cold start.
- **Revert to scale-to-zero** — set the floor back to zero at apply time:

  ```bash
  terraform apply -var image_tag=<sha> -var min_replicas=0
  ```

  This restores no-idle-cost behavior (cold starts return). `min_replicas` /
  `max_replicas` are plain `number` vars in `variables.tf` (defaults 1 / 4).

Changing the replica floor/ceiling, the scale rule, or the probes is an
**in-place revision update** of the Container App — it does **not** force
replacement of `azurerm_container_app.web` (a new revision rolls out under the
existing app/FQDN).

## Monitoring & alerts (#271)

`monitoring.tf` codifies Azure Monitor metric alerts for the Container App and
Postgres, all wired to a single email **action group**. Everything is
**count-gated on `var.alert_email`** (mirroring the repo's env-gating pattern):

- **No `alert_email` set ⇒ nothing is created.** The action group and every alert
  resolve to `count = 0`, so a no-email `terraform apply` adds **zero** new
  resources and the existing deploy plan stays clean (inert until enabled).
- **Activate** by setting the email in an auto-loaded tfvars file (NOT a one-shot
  `-var`):

  ```bash
  cd infra/azure
  cp alerts.auto.tfvars.example alerts.auto.tfvars
  # edit alerts.auto.tfvars → alert_email = "ops@example.com"
  ```

  Terraform **auto-loads every `*.auto.tfvars`** on every plan/apply, so the email
  **persists across applies**. This is the only correct way to enable alerts: the
  normal deploy runs `terraform apply -var image_tag=…` **without**
  `-var alert_email=…`, so passing the email as a one-shot `-var` would set the
  gate back to `0` on the next routine apply and **DESTROY the action group + all
  alerts** (silently disabling monitoring). The `alerts.auto.tfvars` file keeps the
  gate stable. It is **gitignored** (it may carry the ops email) — commit only
  `alerts.auto.tfvars.example`.

  Enabling creates the action group `ag-project50-ops-dev` (one email receiver,
  common alert schema) plus the alerts below.

| Alert | Scope | Metric (namespace) | Condition |
| --- | --- | --- | --- |
| 5xx server errors | Container App | `Requests` dim `statusCodeCategory=5xx` (`Microsoft.App/containerApps`) | Total > 5 over 5m (Sev1) |
| Replica restarts | Container App | `RestartCount` (`Microsoft.App/containerApps`) | Total > 3 over 15m (Sev2) |
| CPU high | Postgres | `cpu_percent` (`Microsoft.DBforPostgreSQL/flexibleServers`) | Avg > 80% over 15m (Sev2) |
| Storage high | Postgres | `storage_percent` (same) | Avg > 85% over 1h (Sev2) |
| Active connections high | Postgres | `active_connections` (same) | Max > 25 over 15m (Sev2) — ~70% of the ~35 B1ms cap |

Thresholds/windows and their rationale are commented inline in `monitoring.tf`.

**Not codified (deliberate follow-ups, not faked):**

- **p95 latency** — Container Apps exposes no server-side latency/percentile
  metric (`Microsoft.App/containerApps` has no `ResponseTime`). Alert on the app's
  own `http_request_duration_ms` histogram (`/api/metrics`, see
  [`docs/OBSERVABILITY.md`](../../docs/OBSERVABILITY.md)) or front the app with
  Front Door / App Gateway, which do emit latency percentiles.
- **Uptime / cert-expiry** — classic App Insights availability web tests are
  retired and Standard web tests need an App Insights component this stack doesn't
  provision. Use an external black-box checker on `/api/health` (UptimeRobot /
  Grafana Synthetics — see [`docs/OBSERVABILITY.md`](../../docs/OBSERVABILITY.md) §3).

### Key Vault secrets — set out of band, NOT in Terraform state

The Container App references these secrets by **versionless Key Vault URI**
(`${key_vault_uri}secrets/<name>`); their **values are NOT managed by
Terraform**, so no plaintext lands in TF state. Create/rotate them out of band
with `az keyvault secret set` (see the runbook below). Vault:
`kv-project50-dev-6z7n`.

| Secret | Purpose | Set with |
| --- | --- | --- |
| `database-url` | App connection string (least-priv `p50app` role). | `az keyvault secret set` (out of band) |
| `database-url-admin` | Admin connection string — deployer-only (`prisma migrate deploy` + role bootstrap), never the running app. | `az keyvault secret set` (out of band) |
| `auth-secret` | Auth.js JWT signing key (`openssl rand -base64 32`). | `az keyvault secret set` (out of band) |
| `metrics-token` | Bearer token guarding `GET /api/metrics`. **Until set, the route falls open** — see below. | `az keyvault secret set` (out of band) |
| `facebook-client-id` / `facebook-client-secret` | Facebook OAuth credentials. | `az keyvault secret set` (out of band) |

The only generated secret still in TF state is the Postgres server
`administrator_password` (`random_password.db_admin`) — it is the
`administrator_password` argument of the Flexible Server, which has no
Key-Vault-native / write-only form on this `azurerm` version, so its value is
unavoidably in state. It is *not* stored as a Key Vault secret here.

## Deploy runbook (run locally with `az login`)

> Per project policy: deploy only after the app is CI-green, merged to `main`,
> and a release tag is cut. Always `plan` and review cost before `apply`.

> ## ⚠️ ONE-TIME MIGRATION — do this BEFORE the first `terraform apply`, or you will DELETE the live secrets
>
> This release stopped declaring the `database-url`, `database-url-admin`, and
> `auth-secret` `azurerm_key_vault_secret` resources. On the **existing**
> deployment, the **very first** `terraform apply` with this code will see those
> three resources are gone and **plan their DESTRUCTION — deleting them from Key
> Vault**, which takes down the running app's DB + Auth.
>
> So on an existing deployment, **before any `terraform apply`/`plan` with this
> code**, you MUST (a) make sure the secret VALUES already exist in Key Vault
> (set out of band — see [Key Vault secrets — create / rotate](#key-vault-secrets--create--rotate-out-of-band))
> so the app keeps resolving them, then (b) drop them from Terraform's state so
> the apply no longer plans to delete them:
>
> ```bash
> cd infra/azure
> terraform init
> # (a) verify EVERY secret the Container App references exists in KV before the
> #     apply — a missing one makes `terraform apply` FAIL resolving the secret
> #     block (this includes metrics-token, which is NEW in this release):
> for n in database-url database-url-admin auth-secret \
>          facebook-client-id facebook-client-secret metrics-token; do
>   az keyvault secret show --vault-name kv-project50-dev-6z7n --name "$n" --query name -o tsv
> done
> # (b) stop Terraform tracking the three it used to manage (state rm does NOT
> #     delete the KV secret):
> terraform state rm azurerm_key_vault_secret.database_url
> terraform state rm azurerm_key_vault_secret.database_url_admin
> terraform state rm azurerm_key_vault_secret.auth_secret
> # Now `terraform plan` must show NO destroy for these three secrets before you apply.
> ```
>
> **Secrets that MUST exist in Key Vault before the first `terraform apply`** (the
> Container App references each by versionless URI; a missing one fails the
> apply): `database-url`, `database-url-admin`, `auth-secret` (already in KV from
> the prior deployment), `facebook-client-id`, `facebook-client-secret` (already
> in KV), and **`metrics-token`** (NEW in this release — set it in step 2 of the
normal deploy path below, before the apply).
>
> Skip this block ONLY on a brand-new green-field bootstrap where these resources
> were never in state. See also
> [One-time migration](#one-time-migration-stop-terraform-tracking-these-secret-values)
> (state-history scrub + rotate-once) below.

### Normal deploy path (existing deployment — the common case)

The Postgres server and the `database-url-admin` KV secret **already exist** from
the prior deployment, so this path reads the admin URL **straight from Key
Vault** and never touches the `db_admin_*` Terraform outputs (those are newly
added in this release and don't exist in state until *after* a successful apply —
see [Bootstrap / secret recovery](#bootstrap--secret-recovery) for first-ever or
post-scrub recreation).

End-to-end order (each step depends on the previous; **migrations run BEFORE the
image switch** so live traffic never hits the new revision against the old
schema):

**[one-time `state rm` migration above] → set/verify KV secrets → read
`database-url-admin` from KV → `prisma migrate deploy` → `terraform apply
image_tag` → roll revision.**

```bash
# 0. Pick the release to deploy. Two DISTINCT identifiers — keep them straight:
#    * IMAGE_SHA — the commit sha; this is the IMAGE tag and the `image_tag` var.
#      Per repo convention (CLAUDE.md) we build AND deploy by commit sha, so the
#      image you build is exactly the image terraform pulls.
#    * TAG — the CalVer release tag; this is for the BADGE only and travels as a
#      `--build-arg NEXT_PUBLIC_RELEASE_TAG`, never as the image tag.
TAG=v2026.06.04.3                          # the cut CalVer release (badge only)
IMAGE_SHA=$(git rev-parse --short=7 HEAD)  # the IMAGE tag == deploy image_tag
ACR=acralztyhlgn6o.azurecr.io
KV=kv-project50-dev-6z7n
RG=rg-project50-dev-canadacentral

# 1. Build the image IN ACR (from repo root) and push to the platform ACR.
#    Use `az acr build` (builds linux/amd64 natively; a local `docker build`
#    under arm64 emulation fails). Building the image does NOT switch the app to
#    it — that happens at the `terraform apply image_tag` in step 5, AFTER
#    migrations.
#
#    IMAGE TAG = commit sha ($IMAGE_SHA); deploy pulls the SAME sha in step 5.
#    The CalVer release TAG does NOT tag the image — it rides in as a
#    `--build-arg NEXT_PUBLIC_RELEASE_*` (tag/title/url) emitted by
#    release-build-args.sh. THAT build-arg is what makes the deployed footer
#    ReleaseBadge show the live CalVer tag (e.g. v2026.06.04.3) linking to its
#    GitHub release notes — without it the ACR build context has NO git tags, so
#    next.config.mjs's `git describe` fallback bakes in "dev / Local development
#    build". The title can contain spaces, so the script emits shell-quoted flags
#    and the line MUST be run through `eval`.
#
#    CAPTURE the helper output FIRST and ABORT on failure: the helper exits
#    non-zero when HEAD isn't at $TAG (or the tag is missing), and inside an
#    inline `$(...)` that failure would otherwise be SWALLOWED — `az acr build`
#    would still run and bake the Dockerfile's default "dev/local" badge,
#    defeating the tag/HEAD gate. So gate on the capture, then `eval` only the
#    already-captured args:
BUILD_ARGS=$(bash scripts/release-build-args.sh "$TAG") \
  || { echo "release-build-args failed (HEAD not at $TAG?)"; exit 1; }
eval "az acr build --registry acralztyhlgn6o --image project50-web:$IMAGE_SHA \
  --platform linux/amd64 --file apps/web/Dockerfile $BUILD_ARGS ."
#    (Equivalently: `ACR_LINE=1 bash scripts/release-build-args.sh "$TAG"` prints
#    a full, ready-to-eval `az acr build ...` line — it tags the image with the
#    commit sha too, matching `terraform apply -var image_tag=$IMAGE_SHA` below.)

# 2. Ensure the KV secrets that must exist BEFORE the apply are present (NOT in
#    TF state). The Container App reads all referenced secrets by versionless URI
#    — any one missing fails `terraform apply` (step 5). metrics-token is NEW in
#    this release: SHOW-OR-CREATE it (never unconditionally `set` on a routine
#    deploy — that would rotate the token and 401 any configured Prometheus/caller
#    until its bearer is rotated in lockstep). Creating it the first time also
#    ACTIVATES the /api/metrics bearer-auth lock (an unset token leaves the
#    endpoint open). Intentional rotation of the scrape credential is a SEPARATE,
#    deliberate step (see "create / rotate" below), never part of a routine deploy.
az keyvault secret show --vault-name "$KV" --name metrics-token >/dev/null 2>&1 \
  || az keyvault secret set --vault-name "$KV" --name metrics-token \
       --value "$(openssl rand -base64 32)" >/dev/null
# (database-url-admin, database-url, auth-secret, facebook-client-id/secret are
#  already in KV from the prior deployment — verify with the loop in the ⚠️
#  callout above. database-url is refreshed in step 4 after the role bootstrap.)

# 3. Open the Postgres firewall to your IP for the migrate + role bootstrap
MYIP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g "$RG" \
  --server-name <psql-name> --name temp-deploy --start-ip-address $MYIP --end-ip-address $MYIP

# 4. Read the ADMIN connection string straight from Key Vault (it already exists
#    on an existing deployment — read-only, so no Secrets Officer grant needed,
#    and no dependency on the new TF outputs). MIGRATE FIRST (as ADMIN), BEFORE
#    switching the image, so the new revision never serves traffic against the
#    old schema.
#
#    Do NOT rotate the p50app password or re-write `database-url` on a routine
#    deploy: the app's `database-url` already exists in KV, and an unconditional
#    `az keyvault secret set` would (a) require the deployer to already hold
#    Key Vault Secrets Officer and (b) needlessly rotate a live credential each
#    deploy. The role bootstrap below is run ONLY when the p50app password is
#    being (re)set — i.e. first bootstrap or a deliberate DB-credential rotation
#    (see "create / rotate" below) — and if you run it you MUST also overwrite
#    `database-url` to match (that write is a deliberate rotation, which assumes
#    the deployer holds Secrets Officer from the one-time bootstrap).
ADMIN_URL="$(az keyvault secret show --vault-name "$KV" --name database-url-admin --query value -o tsv)"
DATABASE_URL="$ADMIN_URL" pnpm --filter @project50/db exec prisma migrate deploy
# (p50app role + database-url already exist from the bootstrap — nothing to write
#  here. To intentionally rotate the p50app credential, see "create / rotate".)

# 5. NOW switch the Container App to the new image (schema is already migrated).
#    image_tag is the COMMIT SHA — the exact image built+pushed in step 1
#    (project50-web:$IMAGE_SHA), NOT the CalVer $TAG. No secret VALUES pass
#    through Terraform. `plan` MUST show no destroy of the three KV-secret
#    resources (it won't if the one-time `state rm` was done).
cd infra/azure
terraform init
terraform plan  -var "image_tag=$IMAGE_SHA"   # ~$13/mo Postgres; review for unexpected destroys
terraform apply -var "image_tag=$IMAGE_SHA"

# 6. Roll a fresh revision onto the new image, then remove the temp firewall rule.
#    (No secret values changed on a routine deploy, so this is just the image roll.)
az containerapp revision restart -g "$RG" -n ca-project50-web-dev \
  --revision "$(az containerapp show -g "$RG" -n ca-project50-web-dev --query 'properties.latestRevisionName' -o tsv)"
az postgres flexible-server firewall-rule delete -g "$RG" \
  --server-name <psql-name> --name temp-deploy --yes

# 7. App URL
terraform output -raw app_url

# 8. GDPR guard: assert blob soft delete is still OFF on the media account (the
#    hard-erase guarantee depends on it; `apply` can't assert an *absent* policy).
#    See "Verify blob soft delete is OFF" under Object storage — both queries
#    must return false/null:
SA="$(terraform output -raw storage_account_name)"
az storage account blob-service-properties show --account-name "$SA" \
  --query 'deleteRetentionPolicy.enabled'           # expect: false (or null)
az storage account blob-service-properties show --account-name "$SA" \
  --query 'containerDeleteRetentionPolicy.enabled'  # expect: false (or null)
```

### Bootstrap / secret recovery

Use this path only on a **green-field bootstrap** (no vault/server yet) or to
**recreate `database-url-admin`** after the state-history scrub.

**Root cause — why a true bootstrap must be STAGED:** there is a circular
ordering on a fresh environment.

- The Container App resolves **every** KV secret reference at create time, so all
  referenced secrets must already exist in Key Vault before
  `azurerm_container_app.web` is created — otherwise its create fails.
- But writing those secrets (`az keyvault secret set`) requires the **vault** and
  the deployer's **Key Vault Secrets Officer** RBAC grant to already exist and
  have propagated — and on a fresh env those don't exist until a `terraform
  apply` has run.

You can't do a single full apply (Container App needs secrets that can't be
written yet), and you can't seed secrets first (vault/grant don't exist yet). The
fix is a **targeted Stage-1 apply** that builds the vault + RBAC **without** the
Container App, so secrets can be written, then a full apply.

The Container App references these five secrets (must exist before the full
apply): `database-url`, `auth-secret`, `metrics-token`, `facebook-client-id`,
`facebook-client-secret`. (`database-url-admin` is deployer-only — NOT referenced
by the app — so it isn't required pre-apply, only before migrations.)

```bash
KV=kv-project50-dev-6z7n
# Same identifier split as the normal path: IMAGE_SHA = the IMAGE tag (== deploy
# image_tag), TAG = the CalVer release for the BADGE only (a `--build-arg`).
TAG=v2026.06.04.3                          # the cut CalVer release (badge only)
IMAGE_SHA=$(git rev-parse --short=7 HEAD)  # the IMAGE tag == deploy image_tag

# Build + push the initial image to ACR (from the repo root), tagged by COMMIT
# SHA — the exact tag Stage 3's `terraform apply -var image_tag=$IMAGE_SHA` pulls.
# The CalVer tag/title/url ride in as `--build-arg NEXT_PUBLIC_RELEASE_*` so the
# footer ReleaseBadge shows the live release (see release-build-args.sh; the line
# MUST be `eval`'d because the release title can contain spaces). As in the normal
# path, CAPTURE the helper output FIRST and ABORT on failure — an inline `$(...)`
# would swallow the helper's non-zero exit (HEAD not at $TAG) and build a default
# "dev/local" badge anyway.
BUILD_ARGS=$(bash scripts/release-build-args.sh "$TAG") \
  || { echo "release-build-args failed (HEAD not at $TAG?)"; exit 1; }
eval "az acr build --registry acralztyhlgn6o --image project50-web:$IMAGE_SHA \
  --platform linux/amd64 --file apps/web/Dockerfile $BUILD_ARGS ."

cd infra/azure
terraform init

# ── Stage 1: create the vault + KV RBAC grants ONLY (NOT the Container App) ──
#    Targeted apply so the secret-writes in Stage 2 have a vault + the deployer's
#    Secrets Officer grant, and the app UAMI's Secrets User grant + the
#    propagation wait exist — WITHOUT creating azurerm_container_app.web (which
#    would fail: the secrets it references don't exist yet). module.onboard
#    creates the Key Vault + the UAMI's "Key Vault Secrets User" grant;
#    azurerm_role_assignment.deployer_kv_secrets is the deployer's "Secrets
#    Officer" grant; time_sleep.kv_rbac_propagation is the 60s wait covering both.
terraform apply \
  -target=module.onboard \
  -target=azurerm_role_assignment.deployer_kv_secrets \
  -target=time_sleep.kv_rbac_propagation

# ── Stage 2: wait for RBAC to propagate, then SEED every referenced secret ──
#    The deployer now has KV data-plane access (the Stage-1 time_sleep already
#    waited 60s for it). All show-or-create, so re-running never clobbers a real
#    value. SECURITY: do NOT seed live credentials with weak placeholders — if the
#    env goes live before they're replaced, the app would run on known creds.
#
#    CREDENTIAL secrets get REAL high-entropy values right here (no placeholder):
for s in auth-secret metrics-token; do
  az keyvault secret show --vault-name "$KV" --name "$s" >/dev/null 2>&1 \
    || az keyvault secret set --vault-name "$KV" --name "$s" \
         --value "$(openssl rand -base64 32)" >/dev/null
done
#
#    DB connection strings get a TEMPORARY placeholder ONLY because their real
#    value genuinely can't exist until the Postgres server is created in Stage 3.
#    Both MUST be overwritten with real values in Stage 4 (database-url with the
#    p50app connection string, database-url-admin reconstructed from the outputs):
for s in database-url database-url-admin; do
  az keyvault secret show --vault-name "$KV" --name "$s" >/dev/null 2>&1 \
    || az keyvault secret set --vault-name "$KV" --name "$s" \
         --value "placeholder-overwrite-in-stage-4" >/dev/null
done
#
#    OAuth credentials: set the REAL Meta app id/secret (login won't work until
#    they're real). If Facebook login isn't wired yet, the operator can set them
#    later — but seed SOMETHING so the Container App create resolves the refs:
for s in facebook-client-id facebook-client-secret; do
  az keyvault secret show --vault-name "$KV" --name "$s" >/dev/null 2>&1 \
    || az keyvault secret set --vault-name "$KV" --name "$s" \
         --value "REPLACE-with-real-facebook-value" >/dev/null   # set the real Meta app id/secret
done

# ── Stage 3: full apply — now creates azurerm_container_app.web ──
#    All five referenced secrets exist, so the Container App resolves them. This
#    also creates the Postgres server + random_password.db_admin + the db_admin_*
#    / postgres_fqdn outputs. image_tag is the COMMIT SHA built above
#    (project50-web:$IMAGE_SHA) — the same image, NOT the CalVer $TAG. On a fresh
#    DB the app pointing at this image is fine: there's no live traffic / old
#    schema yet, so image-before-migrate is safe here. (On an EXISTING deployment,
#    do NOT use this path — use the normal path above, which reads the admin URL
#    from KV and migrates before the image.)
terraform apply -var "image_tag=$IMAGE_SHA"

# ── Stage 4: reconstruct database-url-admin from outputs, migrate, set real
#             database-url, roll a revision ──
#    Azure never reveals an existing admin password; the db_admin_password output
#    is the only source (see the note in outputs.tf), and it exists now that
#    Stage 3 applied.
PG_HOST="$(terraform output -raw postgres_fqdn)"
ADMIN_LOGIN="$(terraform output -raw db_admin_login)"
ADMIN_PW="$(terraform output -raw db_admin_password)"
ENC_PW="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$ADMIN_PW")"
ADMIN_URL="postgresql://${ADMIN_LOGIN}:${ENC_PW}@${PG_HOST}:5432/project50?sslmode=require"
az keyvault secret set --vault-name "$KV" --name database-url-admin --value "$ADMIN_URL" >/dev/null

# Open the firewall, migrate as admin, bootstrap the p50app role with a fresh
# password, then OVERWRITE the placeholder database-url with the REAL p50app
# connection string (this write is fine here — bootstrap holds Secrets Officer).
MYIP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g rg-project50-dev-canadacentral \
  --server-name <psql-name> --name temp-deploy --start-ip-address $MYIP --end-ip-address $MYIP
APP_DB_PW="p50app_$(openssl rand -hex 12)"
DATABASE_URL="$ADMIN_URL" pnpm --filter @project50/db exec prisma migrate deploy
# Pipe the repo SQL file in on stdin (it is NOT inside the postgres:16 image, so
# `-f infra/azure/sql/app-role.sql` would look for it in the container and fail).
# Read the script from stdin with `-f -`; run from the repo root so the path resolves.
docker run --rm -i postgres:16 psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v pw="$APP_DB_PW" \
  -f - < infra/azure/sql/app-role.sql
az keyvault secret set --vault-name "$KV" --name database-url \
  --value "postgresql://p50app:$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$APP_DB_PW")@${PG_HOST}:5432/project50?sslmode=require" >/dev/null
az postgres flexible-server firewall-rule delete -g rg-project50-dev-canadacentral \
  --server-name <psql-name> --name temp-deploy --yes

# If you seeded auth-secret / facebook-* with placeholders above, set their REAL
# values now (auth-secret was generated for real by the seed loop; facebook-*
# need the real Meta app id/secret). Then roll a fresh revision so the app stops
# serving any placeholders:
az containerapp update -g rg-project50-dev-canadacentral -n ca-project50-web-dev \
  --revision-suffix "bootstrap$(date +%Y%m%d%H%M)"
```

### Key Vault secrets — create / rotate (out of band)

These secrets' **values live only in Key Vault**, never in Terraform state.
Create or rotate them with `az keyvault secret set` (vault `kv-project50-dev-6z7n`):

```bash
KV=kv-project50-dev-6z7n

# App connection string (least-priv p50app role). Build from the p50app password
# (infra/azure/sql/app-role.sql) + the Postgres FQDN + db name `project50`.
az keyvault secret set --vault-name "$KV" --name database-url \
  --value "postgresql://p50app:<url-encoded-pw>@<psql-fqdn>:5432/project50?sslmode=require"

# Admin connection string — deployer-only (migrations + role bootstrap). The
# admin password is ONLY retrievable from the TF output (Azure never reveals an
# existing Flexible Server admin password); assemble the URL from the outputs
# (run these from infra/azure so `terraform output` resolves):
( cd infra/azure
  PG_HOST="$(terraform output -raw postgres_fqdn)"
  ADMIN_LOGIN="$(terraform output -raw db_admin_login)"
  ADMIN_PW="$(terraform output -raw db_admin_password)"   # sensitive output
  ENC_PW="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$ADMIN_PW")"
  az keyvault secret set --vault-name "$KV" --name database-url-admin \
    --value "postgresql://${ADMIN_LOGIN}:${ENC_PW}@${PG_HOST}:5432/project50?sslmode=require" )

# Auth.js JWT signing key
az keyvault secret set --vault-name "$KV" --name auth-secret \
  --value "$(openssl rand -base64 32)"

# Bearer token that LOCKS GET /api/metrics (see security note below)
az keyvault secret set --vault-name "$KV" --name metrics-token \
  --value "$(openssl rand -base64 32)"
```

After changing any value, force a new Container App revision so it stops serving
the cached (versionless) value (~30 min cache otherwise):

```bash
az containerapp update -g rg-project50-dev-canadacentral -n ca-project50-web-dev \
  --revision-suffix "rotate$(date +%Y%m%d%H%M)"
```

> `AUTH_SECRET` supports comma-separated zero-downtime rotation — see
> [`docs/SECRETS.md`](../../docs/SECRETS.md#auth_secret-zero-downtime-rotation).

> **SECURITY — `metrics-token` locks `/api/metrics`.** The route
> (`apps/web/app/api/metrics/route.ts`) enforces `Authorization: Bearer
> <token>` **only when `METRICS_TOKEN` is non-empty**; with the secret unset the
> auth check falls open and the metrics endpoint is **publicly reachable** on the
> prod ingress. Setting `metrics-token` out of band (above) + rolling a new
> revision is what closes it — until both happen, `/api/metrics` stays open. The
> Prometheus scrape config (and any other caller) must then send the same token
> as `Authorization: Bearer <token>`; rotate the scrape credential together with
> this secret. See [`docs/SECRETS.md`](../../docs/SECRETS.md) (`METRICS_TOKEN`).

### One-time migration: stop Terraform tracking these secret values

Terraform previously managed `database-url`, `database-url-admin`, and
`auth-secret` as `azurerm_key_vault_secret` resources, so their plaintext was in
TF state. This config no longer declares those resources.

**The `state rm` step is mandatory and must run BEFORE the first `terraform
apply` with this code** — otherwise that apply plans to DESTROY the three KV
secrets and takes down the live app. It is documented as the prominent
[⚠️ ONE-TIME MIGRATION](#deploy-runbook-run-locally-with-az-login) callout at the
top of the deploy runbook; do that first. `state rm` only drops Terraform's
bookkeeping — the secrets stay in Key Vault. After it, `terraform plan` must show
no destroy for these three secrets.

The remaining one-time concern is the leaked plaintext in state history:

> **Scrub the old plaintext from state history.** The values these resources held
> already exist in **prior versions** of the remote state blob
> (`apps/project50.tfstate`). After the `state rm` above, treat those three
> secrets as exposed: **rotate each one once** via `az keyvault secret set` (and
> force a new revision), then **delete the old TF state blob versions/snapshots**
> that still contain the plaintext (Azure Blob versioning / soft-delete on the
> `tfstate` container) per the leak-handling guidance in
> [`docs/SECRETS.md`](../../docs/SECRETS.md). Until both the rotation and the
> state-history scrub are done, the old values must be considered compromised.

## Custom domain & cert in Terraform (#268)

The app is live on **https://www.project50.fit** via a custom-domain binding +
an Azure-**managed** TLS cert on the Container Apps **environment**, plus **3
Azure Policy exemptions** (`exempt-managedcert-tag-{owner,env,app}`) that waive a
tag-required policy for the managed cert (Azure-managed certs carry no user
tags). All five resources were originally created **imperatively with `az`** this
session, so they're real Azure resources that were **not** in Terraform — the
drift #268 closes.

`main.tf` now declares them (all gated on `var.manage_custom_domain`, default
`true` to match the live deployment):

| Terraform address | Resource | Azure resource |
| --- | --- | --- |
| `azurerm_container_app_environment_managed_certificate.web[0]` | `azurerm_container_app_environment_managed_certificate` | managed cert for `www.project50.fit` on `cae-project50-dev` |
| `azurerm_container_app_custom_domain.web[0]` | `azurerm_container_app_custom_domain` | the `SniEnabled` binding of `www.project50.fit` → `ca-project50-web-dev` |
| `azurerm_resource_policy_exemption.managedcert_tag["owner"]` | `azurerm_resource_policy_exemption` | `exempt-managedcert-tag-owner` |
| `azurerm_resource_policy_exemption.managedcert_tag["env"]` | `azurerm_resource_policy_exemption` | `exempt-managedcert-tag-env` |
| `azurerm_resource_policy_exemption.managedcert_tag["app"]` | `azurerm_resource_policy_exemption` | `exempt-managedcert-tag-app` |

> **azurerm 4.x shape (researched against the provider schema):** the binding is
> a **separate resource** `azurerm_container_app_custom_domain` — NOT a
> `custom_domain {}` block inside `ingress` (that ingress attribute is
> computed/read-only in 4.x). The managed cert is
> `azurerm_container_app_environment_managed_certificate`, NOT the BYO
> `azurerm_container_app_environment_certificate`. For a managed cert the bound
> cert id is the **computed** `container_app_environment_managed_certificate_id`,
> so the binding sets only `certificate_binding_type = "SniEnabled"` and
> `ignore_changes`-es it to keep an imported binding at **No changes**.

### Import runbook (orchestrator runs this — DO NOT recreate)

These are **import-targeted**: the resource definitions are written to match the
live resources, so after `terraform import` for each, `terraform plan` MUST show
**No changes**. Reconcile any diff by **adjusting the resource attributes** (or
the `# VERIFY:` placeholders in `main.tf`), never by recreating.

```bash
cd infra/azure
terraform init

SUB=81e891a1-b374-4898-8fed-0871de418dae
RG=rg-project50-dev-canadacentral
ENV=cae-project50-dev
APP=ca-project50-web-dev
DOMAIN=www.project50.fit

# ── 0. Look up the live values the import IDs / config need ──────────────────
# (a) the live MANAGED CERT name on the environment (fills the `name` in main.tf —
#     # VERIFY: name = "mc-project50-www"; replace if this prints something else):
MC_NAME=$(az containerapp env certificate list -g "$RG" --name "$ENV" \
  --managed-certificates-only --query "[?properties.subjectName=='$DOMAIN'].name | [0]" -o tsv)
echo "managed cert name = $MC_NAME"
MC_ID="/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/managedEnvironments/$ENV/managedCertificates/$MC_NAME"

# (b) the live POLICY ASSIGNMENT id the 3 exemptions target (same for all three;
#     set it via -var below — it's `# VERIFY: policy_assignment_id` in main.tf):
POLICY_ASSIGNMENT_ID=$(az policy exemption show --name exempt-managedcert-tag-owner \
  --scope "$MC_ID" --query policyAssignmentId -o tsv)
echo "policy assignment id = $POLICY_ASSIGNMENT_ID"
# (c) the live exemptionCategory (# VERIFY: exemption_category = "Waiver"):
az policy exemption show --name exempt-managedcert-tag-owner --scope "$MC_ID" \
  --query exemptionCategory -o tsv   # expect: Waiver

# All plan/import/apply below MUST pass the looked-up assignment id so the
# exemptions converge (it has no default):
TFVARS=(-var "managedcert_tag_policy_assignment_id=$POLICY_ASSIGNMENT_ID")

# ── 1. Managed certificate ───────────────────────────────────────────────────
#   id format: .../Microsoft.App/managedEnvironments/{env}/managedCertificates/{name}
terraform import "${TFVARS[@]}" \
  'azurerm_container_app_environment_managed_certificate.web[0]' \
  "$MC_ID"

# ── 2. Custom-domain binding ─────────────────────────────────────────────────
#   id format: .../Microsoft.App/containerApps/{app}/customDomainName/{fqdn}
terraform import "${TFVARS[@]}" \
  'azurerm_container_app_custom_domain.web[0]' \
  "/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/containerApps/$APP/customDomainName/$DOMAIN"

# ── 3. The 3 managed-cert tag-policy exemptions ──────────────────────────────
#   id format: {scope}/providers/Microsoft.Authorization/policyExemptions/{name}
#   scope = the managed cert resource id ($MC_ID)
terraform import "${TFVARS[@]}" \
  'azurerm_resource_policy_exemption.managedcert_tag["owner"]' \
  "$MC_ID/providers/Microsoft.Authorization/policyExemptions/exempt-managedcert-tag-owner"
terraform import "${TFVARS[@]}" \
  'azurerm_resource_policy_exemption.managedcert_tag["env"]' \
  "$MC_ID/providers/Microsoft.Authorization/policyExemptions/exempt-managedcert-tag-env"
terraform import "${TFVARS[@]}" \
  'azurerm_resource_policy_exemption.managedcert_tag["app"]' \
  "$MC_ID/providers/Microsoft.Authorization/policyExemptions/exempt-managedcert-tag-app"

# ── 4. Verify convergence — this MUST print "No changes" ─────────────────────
terraform plan "${TFVARS[@]}" -var "image_tag=<current sha>"
```

If the plan shows a diff, **reconcile by editing the resource attributes**, not by
recreating. The known places to check are the `# VERIFY:` comments in `main.tf`:

| `# VERIFY:` in `main.tf` | What to confirm during import | How to look it up |
| --- | --- | --- |
| `name = "mc-project50-www"` (managed cert) | the live managed-cert **resource name** — set `name` to whatever step 0(a) printed | `az containerapp env certificate list -g $RG --name $ENV --managed-certificates-only --query '[].name'` |
| `policy_assignment_id` (exemptions) | the live **policy assignment id** — pass via `-var managedcert_tag_policy_assignment_id=…` (step 0b) | `az policy exemption show --name exempt-managedcert-tag-owner --scope $MC_ID --query policyAssignmentId` |
| `exemption_category = "Waiver"` | the live category (`Waiver` vs `Mitigated`) — edit if different | `az policy exemption show … --query exemptionCategory` |
| managed-cert `tags` (commented out) | whether the live cert carries `module.onboard.tags`; if `plan` shows a tags diff, uncomment `tags = module.onboard.tags` | `az containerapp env certificate show … --query tags` |
| binding `container_app_environment_certificate_id` | if `plan` still diffs here after import, add it to the binding's `ignore_changes` (Azure recorded the cert under the computed managed-cert id) | inspect the `plan` diff |
| exemption `display_name` / `description` / `metadata` | add to the resource only if `plan` shows a diff | `az policy exemption show … -o json` |

A **no-domain** plan is unaffected: `terraform plan -var manage_custom_domain=false`
creates/manages none of the above (it does not even reference
`managedcert_tag_policy_assignment_id`).

## Apex domain `project50.fit` → `www` (#291)

**Recommendation: do NOT bind the apex on the Container App. Use a
registrar/DNS-level URL redirect** (Namecheap) `project50.fit` →
`https://www.project50.fit`.

**Why not an apex managed cert:** apex managed certs **fail** on Container Apps —
issuance uses an HTTP ACME challenge on `http://project50.fit/.well-known/...`,
but the app's ingress **redirects HTTP→HTTPS**, which breaks the challenge before
the CA can validate it. (Subdomains like `www` provision cleanly because the
`www` CNAME's validation path isn't subject to the same apex redirect trap.) So
there is **no reliable apex managed cert**, and adding fragile apex-cert TF would
just produce a perpetually-failing resource — deliberately omitted here.

**Recommended path (registrar URL redirect at Namecheap):**

1. In Namecheap → **Domain List → project50.fit → Manage**.
2. Ensure the `www` host points at the Container App (the existing setup):
   - `CNAME` `www` → the app FQDN (`ca-project50-web-dev.<env-region>.azurecontainerapps.io`), and
   - the `asuid.www` `TXT` domain-verification record Azure required for the `www` binding.
3. Under **Redirect Domain**, add an **unmasked (301 permanent)** redirect:
   - **Source:** `@` (apex `project50.fit`) — and optionally `http://`/`https://` both.
   - **Destination:** `https://www.project50.fit`
   - Type: **Permanent (301)**, **unmasked** (a real redirect, not a frame).
4. Save. Namecheap serves the apex over its own redirect endpoint, so the apex
   never needs a cert **on the Container App**. Verify:

   ```bash
   curl -sI http://project50.fit  | grep -i '^location:'   # → https://www.project50.fit
   curl -sI https://project50.fit | grep -i '^location:'   # → https://www.project50.fit
   ```

This keeps `www` as the single canonical, cert-bearing origin (managed cert,
auto-renewed) and routes the apex to it at the DNS/registrar layer — no apex cert,
no fragile apex TF.

## Object storage

The app selects its storage backend by env (`apps/web/lib/storage.ts`): when
`AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_CONTAINER` / `AZURE_STORAGE_KEY` are
set (wired here from Key Vault), it uses Azure Blob with SAS URLs; otherwise it
falls back to S3/MinIO. No code change needed between local and Azure.

### Verify blob soft delete is OFF (GDPR hard-erase guarantee)

Account deletion must **permanently** erase a user's media, which requires blob
**soft delete to stay DISABLED** on the media storage account — otherwise a
deleted blob is recoverable and the GDPR erasure contract
(`apps/web/lib/storage.ts`) is silently broken.

This is enforced by **omission** in `main.tf`: the `azurerm_storage_account.media`
`blob_properties` block deliberately carries no `delete_retention_policy` /
`container_delete_retention_policy` (azurerm has no `enabled = false` form, and
`days = 0` is rejected — the only "disabled" is absence). Because the disabled
state is an *absence*, Terraform can't assert it with a precondition, so verify
it at the data plane **after every `terraform apply`** (and any portal change):

```bash
# Resolve the (suffixed) storage account name from Terraform, then assert both
# the blob-level and container-level soft-delete policies are OFF. Each query
# must print `false` or empty/null — anything else means soft delete is ON and
# must be turned back off (drop the retention policy) before going live.
SA="$(terraform output -raw storage_account_name 2>/dev/null \
      || az storage account list -g rg-project50-dev-canadacentral \
           --query "[?starts_with(name,'stp50media')].name | [0]" -o tsv)"   # e.g. stp50mediazv34o5

az storage account blob-service-properties show --account-name "$SA" \
  --query 'deleteRetentionPolicy.enabled'           # expect: false (or null)
az storage account blob-service-properties show --account-name "$SA" \
  --query 'containerDeleteRetentionPolicy.enabled'  # expect: false (or null)
```

> If either returns `true`, soft delete has been enabled out-of-band. Disable it
> (remove the retention policy in the portal or re-run `terraform apply`, which
> reasserts the policy-free `blob_properties`) so account deletion stays a true
> hard-erase. Run this as the **final step of every deploy** (see the runbook).

## Notes
- Module source is the private landing-zone repo; `terraform init` needs git
  access to it (`gh auth setup-git` locally, or a token in CI).
- Budgets are disabled on this Sponsorship subscription; track spend with the
  landing zone's `scripts/cost-report.sh`.
