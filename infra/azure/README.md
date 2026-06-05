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

```bash
# 0. Pick the release tag to deploy
TAG=v2026.06.04.3            # the cut release
ACR=acralztyhlgn6o.azurecr.io
KV=kv-project50-dev-6z7n
RG=rg-project50-dev-canadacentral

# 1. Build the image (from repo root) and push to the platform ACR
az acr login -n acralztyhlgn6o
docker build -f apps/web/Dockerfile -t "$ACR/project50-web:$TAG" .
docker push "$ACR/project50-web:$TAG"

# 2. Open the Postgres firewall to your IP for the migrate + role bootstrap
MYIP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g "$RG" \
  --server-name <psql-name> --name temp-deploy --start-ip-address $MYIP --end-ip-address $MYIP

# 3. Migrate as ADMIN, then create/refresh the least-privilege p50app role.
#    The app connects as p50app (NOT admin); migrations + role bootstrap use admin.
#    database-url-admin is an OUT-OF-BAND KV secret (NOT managed by Terraform) —
#    set it once with the server admin creds (see "Key Vault secrets" runbook).
APP_DB_PW="p50app_$(openssl rand -hex 12)"
ADMIN_URL="$(az keyvault secret show --vault-name "$KV" --name database-url-admin --query value -o tsv)"
DATABASE_URL="$ADMIN_URL" pnpm --filter @project50/db exec prisma migrate deploy
docker run --rm -i postgres:16 psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v pw="$APP_DB_PW" \
  -f infra/azure/sql/app-role.sql

# 4. Set the APP connection string out of band (NOT in TF state). Derive the
#    host/db from the admin URL you just used. The Container App reads this by
#    versionless URI; force a new revision (step 6) to pick up a changed value.
PG_HOST="$(echo "$ADMIN_URL" | sed -E 's#.*@([^:/]+).*#\1#')"
az keyvault secret set --vault-name "$KV" --name database-url \
  --value "postgresql://p50app:$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$APP_DB_PW")@${PG_HOST}:5432/project50?sslmode=require" >/dev/null

# 5. Apply the infra (no secret values pass through Terraform anymore)
cd infra/azure
terraform init
terraform plan  -var "image_tag=$TAG"   # ~$13/mo Postgres
terraform apply -var "image_tag=$TAG"

# 6. Restart the revision so it picks up the p50app credentials, then remove the temp rule
az containerapp revision restart -g "$RG" -n ca-project50-web-dev \
  --revision "$(az containerapp show -g "$RG" -n ca-project50-web-dev --query 'properties.latestRevisionName' -o tsv)"
az postgres flexible-server firewall-rule delete -g "$RG" \
  --server-name <psql-name> --name temp-deploy --yes

# 7. App URL
terraform output -raw app_url
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

# Admin connection string — deployer-only (migrations + role bootstrap). Built
# from the server administrator_password (random_password.db_admin in TF state,
# read via `terraform output` or the Azure portal) + the admin login.
az keyvault secret set --vault-name "$KV" --name database-url-admin \
  --value "postgresql://p50admin:<url-encoded-pw>@<psql-fqdn>:5432/project50?sslmode=require"

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
TF state. This config no longer declares those resources. On the **existing**
deployment, the operator must run these **once** so Terraform stops tracking the
values (the secrets stay in Key Vault — `state rm` only drops Terraform's
bookkeeping, it does NOT delete the Key Vault secret):

```bash
cd infra/azure
terraform init
terraform state rm azurerm_key_vault_secret.database_url
terraform state rm azurerm_key_vault_secret.database_url_admin
terraform state rm azurerm_key_vault_secret.auth_secret
# A subsequent `terraform plan` should now show NO changes for these secrets.
```

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
