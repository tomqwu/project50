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
| Key Vault secrets | `database-url`, `auth-secret`, `storage-key` | — |

The app's managed identity (`uami-project50-dev`, from onboard) pulls the image
(AcrPull) and reads the Key Vault secrets (Key Vault Secrets User).

## Deploy runbook (run locally with `az login`)

> Per project policy: deploy only after the app is CI-green, merged to `main`,
> and a release tag is cut. Always `plan` and review cost before `apply`.

```bash
# 0. Pick the release tag to deploy
TAG=v2026.06.04.3            # the cut release
ACR=acralztyhlgn6o.azurecr.io

# 1. Build the image (from repo root) and push to the platform ACR
az acr login -n acralztyhlgn6o
docker build -f apps/web/Dockerfile -t "$ACR/project50-web:$TAG" .
docker push "$ACR/project50-web:$TAG"

# 2. Apply the infra (first apply creates Postgres/Storage/Container App)
cd infra/azure
terraform init
terraform plan  -var "image_tag=$TAG"   # review the cost delta (~$13/mo Postgres)
terraform apply -var "image_tag=$TAG"

# 3. Run DB migrations against the new Postgres (one-time / per-migration)
DATABASE_URL="$(az keyvault secret show --vault-name kv-project50-dev-6z7n \
  --name database-url --query value -o tsv)" \
  pnpm --filter @project50/db exec prisma migrate deploy

# 4. App URL
terraform output -raw app_url
```

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
