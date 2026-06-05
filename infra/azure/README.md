# Azure deployment — project50-web

Deploys the web app to **Azure Container Apps** (scale-to-zero) on the cloud
landing zone, with **Postgres Flexible Server** (B1ms) and **Blob storage** for
media. Extends the landing-pad onboarding (same Terraform state,
`apps/project50.tfstate`).

## What it creates (in `rg-project50-dev-canadacentral`)

| Resource | Notes | ~Cost |
| --- | --- | --- |
| Postgres Flexible Server B1ms + `project50` db | burstable, public endpoint + SSL | ~$13/mo |
| Storage account + `media` container | LRS, TLS1.2, private (SAS URLs) | pennies |
| Container Apps Environment | logs → platform LAW | $0 |
| Container App `ca-project50-web-dev` | min-replicas 0, image from ACR, secrets from Key Vault | ~$0 idle |

The app's managed identity (`uami-project50-dev`, from onboard) pulls the image
(AcrPull) and reads the Key Vault secrets (Key Vault Secrets User).

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
# 0. Pick the release tag to deploy
TAG=v2026.06.04.3            # the cut release
ACR=acralztyhlgn6o.azurecr.io
KV=kv-project50-dev-6z7n
RG=rg-project50-dev-canadacentral

# 1. Build the image (from repo root) and push to the platform ACR.
#    (Building the image does NOT switch the app to it — that happens at the
#    `terraform apply image_tag` in step 5, AFTER migrations.)
az acr login -n acralztyhlgn6o
docker build -f apps/web/Dockerfile -t "$ACR/project50-web:$TAG" .
docker push "$ACR/project50-web:$TAG"

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
#    on an existing deployment — no dependency on the new TF outputs). MIGRATE
#    FIRST (as ADMIN), BEFORE switching the image, so the new revision never
#    serves traffic against the old schema. Then refresh the least-privilege
#    p50app role + store the app connection string out of band.
ADMIN_URL="$(az keyvault secret show --vault-name "$KV" --name database-url-admin --query value -o tsv)"
PG_HOST="$(echo "$ADMIN_URL" | sed -E 's#.*@([^:/]+).*#\1#')"
APP_DB_PW="p50app_$(openssl rand -hex 12)"
DATABASE_URL="$ADMIN_URL" pnpm --filter @project50/db exec prisma migrate deploy
docker run --rm -i postgres:16 psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v pw="$APP_DB_PW" \
  -f infra/azure/sql/app-role.sql
az keyvault secret set --vault-name "$KV" --name database-url \
  --value "postgresql://p50app:$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$APP_DB_PW")@${PG_HOST}:5432/project50?sslmode=require" >/dev/null

# 5. NOW switch the Container App to the new image (schema is already migrated).
#    No secret VALUES pass through Terraform. `plan` MUST show no destroy of the
#    three KV-secret resources (it won't if the one-time `state rm` was done).
cd infra/azure
terraform init
terraform plan  -var "image_tag=$TAG"   # ~$13/mo Postgres; review for unexpected destroys
terraform apply -var "image_tag=$TAG"

# 6. Roll a fresh revision so it picks up the (possibly just-changed) DB
#    credentials immediately, then remove the temp firewall rule.
az containerapp revision restart -g "$RG" -n ca-project50-web-dev \
  --revision "$(az containerapp show -g "$RG" -n ca-project50-web-dev --query 'properties.latestRevisionName' -o tsv)"
az postgres flexible-server firewall-rule delete -g "$RG" \
  --server-name <psql-name> --name temp-deploy --yes

# 7. App URL
terraform output -raw app_url
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
TAG=v2026.06.04.3   # any pushed image; on first bootstrap this is the initial image
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
#    waited 60s for it). Show-or-create so re-running never clobbers a real value.
#    database-url gets a throwaway placeholder (overwritten in Stage 4 once the
#    server exists); auth-secret/metrics-token get real generated values;
#    facebook-* need REAL OAuth credentials (use the actual app id/secret, or a
#    placeholder if Facebook login isn't wired yet — login just won't work until
#    set). Also seed database-url-admin (deployer-only) with a placeholder for now.
for s in database-url database-url-admin auth-secret metrics-token \
         facebook-client-id facebook-client-secret; do
  az keyvault secret show --vault-name "$KV" --name "$s" >/dev/null 2>&1 \
    || az keyvault secret set --vault-name "$KV" --name "$s" \
         --value "placeholder-$(openssl rand -hex 8)" >/dev/null
done

# ── Stage 3: full apply — now creates azurerm_container_app.web ──
#    All five referenced secrets exist, so the Container App resolves them. This
#    also creates the Postgres server + random_password.db_admin + the db_admin_*
#    / postgres_fqdn outputs. On a fresh DB the app pointing at $TAG is fine:
#    there's no live traffic / old schema yet, so image-before-migrate is safe
#    here. (On an EXISTING deployment, do NOT use this path — use the normal path
#    above, which reads the admin URL from KV and migrates before the image.)
terraform apply -var "image_tag=$TAG"

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
# Then migrate + bootstrap the p50app role, OVERWRITE the placeholder database-url
# with the real p50app connection string, set real auth-secret / facebook-* values
# if you seeded placeholders, and roll a fresh revision so the app stops serving
# the placeholders — i.e. continue from step 3 of the normal deploy path above
# (open firewall → migrate → set REAL database-url →
# `az containerapp update --revision-suffix ...` to pick up the new values).
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
# existing Flexible Server admin password); assemble the URL from the outputs:
#   cd infra/azure
#   PG_HOST="$(terraform output -raw postgres_fqdn)"
#   ADMIN_LOGIN="$(terraform output -raw db_admin_login)"
#   ADMIN_PW="$(terraform output -raw db_admin_password)"   # sensitive output
#   ENC_PW="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$ADMIN_PW")"
az keyvault secret set --vault-name "$KV" --name database-url-admin \
  --value "postgresql://${ADMIN_LOGIN}:${ENC_PW}@${PG_HOST}:5432/project50?sslmode=require"

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

## Object storage

The app selects its storage backend by env (`apps/web/lib/storage.ts`): when
`AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_CONTAINER` / `AZURE_STORAGE_KEY` are
set (wired here from Key Vault), it uses Azure Blob with SAS URLs; otherwise it
falls back to S3/MinIO. No code change needed between local and Azure.

## Notes
- Module source is the private landing-zone repo; `terraform init` needs git
  access to it (`gh auth setup-git` locally, or a token in CI).
- Budgets are disabled on this Sponsorship subscription; track spend with the
  landing zone's `scripts/cost-report.sh`.
