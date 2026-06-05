# Azure deployment for project50-web — Container Apps (scale-to-zero) + Postgres
# Flexible Server (B1ms) + Blob storage, onto the cloud landing zone.
#
# This config OWNS the same state as the landing-pad onboarding (key
# apps/project50.tfstate): `module.onboard` already created the RG, managed
# identity, and Key Vault; the resources below add the app's serverless runtime
# into that RG and wire secrets through the Key Vault.
#
# Apply model (per project policy): run LOCALLY with `az login`, only after the
# app is CI-green + merged to main + a release tag is cut, and after the
# container image has been built and pushed to the platform ACR. Always
# `terraform plan` and review the monthly cost delta before `apply`.

terraform {
  required_version = ">= 1.6"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
    time    = { source = "hashicorp/time", version = "~> 0.12" }
  }
  backend "azurerm" {
    resource_group_name  = "rg-alz-tfstate"
    storage_account_name = "sttfstate2c115b94b446"
    container_name       = "tfstate"
    key                  = "apps/project50.tfstate"
    use_azuread_auth     = true
  }
}

provider "azurerm" {
  features {}
  subscription_id     = "81e891a1-b374-4898-8fed-0871de418dae"
  storage_use_azuread = true
}

provider "random" {}

data "terraform_remote_state" "platform" {
  backend = "azurerm"
  config = {
    resource_group_name  = "rg-alz-tfstate"
    storage_account_name = "sttfstate2c115b94b446"
    container_name       = "tfstate"
    key                  = "platform.tfstate"
    use_azuread_auth     = true
  }
}

# ── Landing pad (RG + UAMI + Key Vault + GitHub OIDC) ───────────────────────
module "onboard" {
  source = "git::https://github.com/tomqwu/cloud_landing_zone_for_ai_coding.git//modules/app-onboard?ref=main"

  app_name            = "project50"
  env                 = "dev"
  github_repo         = "tomqwu/project50"
  github_branches     = ["main"]
  github_environments = []
  owner_email         = "tom@deepnative.onmicrosoft.com"

  platform_outputs = data.terraform_remote_state.platform.outputs
}

# Globally-unique suffix for resources whose names share a global namespace.
resource "random_string" "suffix" {
  length  = 6
  lower   = true
  upper   = false
  special = false
  numeric = true
}

# ── Postgres admin password (generated; consumed only by the server resource) ─
# This is the ONLY generated secret that still lands in TF state — it is the
# `administrator_password` argument of the Postgres Flexible Server, which has no
# Key-Vault-native or write-only/ephemeral form on this azurerm version, so the
# value is unavoidably in state. It is NOT a Key Vault secret here; the admin
# connection string (database-url-admin) is set out-of-band in Key Vault — see
# the runbook in README.md.
resource "random_password" "db_admin" {
  length           = 28
  special          = true
  override_special = "-_." # Postgres-safe specials (avoid URL-breaking chars)
}

# ── Postgres Flexible Server (burstable B1ms — ~$13/mo) ─────────────────────
resource "azurerm_postgresql_flexible_server" "db" {
  name                          = "psql-project50-dev-${random_string.suffix.result}"
  resource_group_name           = module.onboard.resource_group_name
  location                      = module.onboard.location
  version                       = "16"
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  auto_grow_enabled             = true
  administrator_login           = var.db_admin_login
  administrator_password        = random_password.db_admin.result
  zone                          = "1"
  public_network_access_enabled = true # landing zone posture: public endpoint + strong auth (no VNet)
  tags                          = module.onboard.tags

  lifecycle {
    # Storage can only grow; ignore drift if auto-grow bumps it.
    ignore_changes = [zone, storage_mb]
  }
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = "project50"
  server_id = azurerm_postgresql_flexible_server.db.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

# Allow Azure-internal services (Container Apps egress) to reach Postgres.
# 0.0.0.0/0.0.0.0 is Azure's special "allow access from Azure services" rule.
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.db.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# ── Blob storage for media (private container; SAS URLs at runtime) ─────────
resource "azurerm_storage_account" "media" {
  name                            = "stp50media${random_string.suffix.result}"
  resource_group_name             = module.onboard.resource_group_name
  location                        = module.onboard.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  tags                            = module.onboard.tags

  # ⚠️ GDPR HARD-ERASE GUARANTEE — blob soft delete is intentionally DISABLED.
  # Account deletion must PERMANENTLY destroy a user's media; that depends on
  # deleteObject being an immediate hard-erase (no recoverable copy). This is
  # the GDPR account-deletion contract in apps/web/lib/storage.ts. DO NOT enable
  # blob soft delete or container soft delete — doing so would let deleted media
  # be recovered and silently undermine erasure.
  #
  # azurerm has NO `enabled = false` form for soft delete: the DISABLED state is
  # expressed by OMITTING both `delete_retention_policy` and
  # `container_delete_retention_policy` from this `blob_properties` block — which
  # is exactly what this block does (it carries only `cors_rule`). Omission is
  # also the azurerm DEFAULT, so this is belt-and-braces, not a behavior change.
  #
  # Do NOT "make it explicit" by adding `delete_retention_policy { days = 0 }`:
  # the azurerm `days` field is validated IntBetween(1, 365), so `days = 0` is
  # REJECTED at plan time ("expected days to be in the range (1 - 365), got 0"),
  # and any days >= 1 ENABLES retention — the opposite of what we want. The only
  # way to express "disabled" is to OMIT the block (done here).
  #
  # Because "disabled = absence", Terraform cannot assert it with a precondition
  # (there is nothing to reference). The post-deploy guard is the runtime check
  # in README.md ("Verify blob soft delete is OFF") asserting the Azure Blob
  # service property `deleteRetentionPolicy.enabled` is false/null.
  #
  # The cors_rule is required because the web app uploads media via direct
  # browser PUT to SAS URLs, so the Blob service must allow cross-origin
  # PUT/GET from the app's origins (Azure's default CORS posture rejects
  # them). Headers cover the SAS PUT contract (content-type + x-ms-blob-type).
  blob_properties {
    cors_rule {
      allowed_origins    = ["https://www.project50.fit", "https://project50.fit"]
      allowed_methods    = ["GET", "PUT", "HEAD", "OPTIONS"]
      allowed_headers    = ["content-type", "x-ms-blob-type"]
      exposed_headers    = ["etag"]
      max_age_in_seconds = 3600
    }
  }
}

resource "azurerm_storage_container" "media" {
  name                  = "media"
  storage_account_id    = azurerm_storage_account.media.id
  container_access_type = "private"
}

# The app authenticates to Blob with its MANAGED IDENTITY (user-delegation SAS),
# not an account key. Storage Blob Data Contributor includes the
# generateUserDelegationKey action plus read/write — so the UAMI can sign SAS
# and read/write media without any long-lived account key.
resource "azurerm_role_assignment" "uami_blob" {
  scope                = azurerm_storage_account.media.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = module.onboard.identity_principal_id
}

# ── Key Vault RBAC propagation gate ─────────────────────────────────────────
# Two data-plane RBAC grants must be LIVE before the things that depend on them
# (data-plane RBAC is eventually-consistent — acting before propagation 403s):
#   1. The DEPLOYER's "Key Vault Secrets Officer" grant (created here) — needed
#      for the out-of-band `az keyvault secret set` writes the operator runs.
#   2. The app UAMI's "Key Vault Secrets User" grant (created INSIDE
#      module.onboard as azurerm_role_assignment.kv_secrets_user) — needed for
#      the Container App to resolve its versionless KV secret URIs at create time.
# Previously the (now-removed) azurerm_key_vault_secret resources chained the
# Container App behind this wait implicitly; with them gone we make the wait
# depend on BOTH grants and gate the Container App on it explicitly (see
# `depends_on` on azurerm_container_app.web). The module exposes no handle for
# its role assignment, so we depend on module.onboard as a whole — which orders
# after every module resource, including kv_secrets_user.
data "azurerm_client_config" "current" {}

resource "azurerm_role_assignment" "deployer_kv_secrets" {
  scope                = module.onboard.key_vault_id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "time_sleep" "kv_rbac_propagation" {
  # Wait covers BOTH the deployer's Secrets Officer grant and the app UAMI's
  # Secrets User grant (the latter inside module.onboard).
  depends_on      = [azurerm_role_assignment.deployer_kv_secrets, module.onboard]
  create_duration = "60s"
}

# ── App secrets: set OUT-OF-BAND in Key Vault, never in Terraform state ──────
# The values of `database-url`, `database-url-admin`, and `auth-secret` are NOT
# managed by Terraform — they are created/rotated out of band with
# `az keyvault secret set` (see the "Key Vault secrets (out of band)" runbook in
# README.md) and consumed by the Container App below via their versionless
# Key Vault URIs, exactly like the facebook-* OAuth secrets. This keeps the
# plaintext connection strings and signing key out of TF state entirely.
#
#   database-url        postgresql://p50app:<pw>@<fqdn>:5432/<db>?sslmode=require
#                       (p50app password from infra/azure/sql/app-role.sql)
#   database-url-admin  postgresql://<db_admin_login>:<random_password.db_admin>@<fqdn>:5432/<db>?sslmode=require
#                       (deployer-only: prisma migrate deploy + role bootstrap)
#   auth-secret         openssl rand -base64 32  (Auth.js JWT signing key)
#
# (No storage-key secret — the app uses its managed identity for Blob access.)

# The deployer's Key Vault Secrets Officer grant + RBAC-propagation wait below
# remain so the out-of-band `az keyvault secret set` writes (run by the same
# `terraform apply` operator) succeed against the RBAC-mode vault.

# ── Container Apps Environment (logs → platform LAW) ────────────────────────
resource "azurerm_container_app_environment" "env" {
  name                       = "cae-project50-dev"
  resource_group_name        = module.onboard.resource_group_name
  location                   = module.onboard.location
  log_analytics_workspace_id = module.onboard.log_analytics_workspace_id
  tags                       = module.onboard.tags
}

# ── The web app (min 1 warm replica → scales out under load) ────────────────
resource "azurerm_container_app" "web" {
  # Don't create the app until the UAMI's Key Vault Secrets User grant (and the
  # deployer's Officer grant) have propagated — otherwise Container Apps fails
  # resolving the versionless KV secret URIs at create time. Removing the
  # azurerm_key_vault_secret resources dropped the implicit chain that used to
  # enforce this, so the dependency is now explicit.
  depends_on = [time_sleep.kv_rbac_propagation]

  name                         = "ca-project50-web-dev"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = module.onboard.resource_group_name
  revision_mode                = "Single"
  tags                         = module.onboard.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [module.onboard.identity_id]
  }

  # Pull the image from the platform ACR using the UAMI (AcrPull granted by onboard).
  registry {
    server   = module.onboard.acr_login_server
    identity = module.onboard.identity_id
  }

  # Secrets sourced from Key Vault via the UAMI. The VALUES are set out-of-band
  # (az keyvault secret set), NOT managed by Terraform — we reference the
  # versionless secret URI so no credential ever lands in TF state.
  secret {
    name                = "database-url"
    key_vault_secret_id = "${module.onboard.key_vault_uri}secrets/database-url"
    identity            = module.onboard.identity_id
  }
  secret {
    name                = "auth-secret"
    key_vault_secret_id = "${module.onboard.key_vault_uri}secrets/auth-secret"
    identity            = module.onboard.identity_id
  }
  # Bearer token guarding GET /api/metrics. The route enforces auth ONLY when
  # METRICS_TOKEN is set, so leaving it unset leaves the endpoint OPEN on the
  # public ingress — setting this secret out of band is the lock. Same
  # out-of-band + versionless-URI pattern.
  secret {
    name                = "metrics-token"
    key_vault_secret_id = "${module.onboard.key_vault_uri}secrets/metrics-token"
    identity            = module.onboard.identity_id
  }
  # OAuth provider credentials — same out-of-band + versionless-URI pattern.
  secret {
    name                = "facebook-client-id"
    key_vault_secret_id = "${module.onboard.key_vault_uri}secrets/facebook-client-id"
    identity            = module.onboard.identity_id
  }
  secret {
    name                = "facebook-client-secret"
    key_vault_secret_id = "${module.onboard.key_vault_uri}secrets/facebook-client-secret"
    identity            = module.onboard.identity_id
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    # min 1 keeps a replica always warm (no scale-to-zero cold start); max gives
    # headroom to scale OUT under load. Both are vars so the warm-baseline cost
    # can be reverted to scale-to-zero with `-var min_replicas=0`.
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    # HTTP concurrency scale rule: KEDA scales replicas from min→max based on
    # concurrent in-flight requests, then back to min when idle. 80 concurrent
    # requests/replica is a conservative target for the Next.js standalone server
    # at 0.5 vCPU — high enough not to scale on light traffic, low enough to add a
    # replica before a single one saturates. (concurrent_requests is a string.)
    http_scale_rule {
      name                = "http-concurrency"
      concurrent_requests = "80"
    }

    container {
      name  = "web"
      image = "${module.onboard.acr_login_server}/project50-web:${var.image_tag}"
      # Keep per-replica resources minimal but SAFE: 0.5 vCPU / 1Gi is already a
      # modest footprint for the Next.js standalone server. Do NOT drop to
      # 0.25/0.5Gi — the Node server can OOM under load at 0.5Gi. Scale OUT (more
      # replicas via the http_scale_rule above), not down per replica.
      cpu    = 0.5
      memory = "1Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "AUTH_SECRET"
        secret_name = "auth-secret"
      }
      # Locks GET /api/metrics behind a bearer token. Sourced from the
      # out-of-band metrics-token KV secret; the route only enforces auth when
      # this is non-empty (see apps/web/app/api/metrics/route.ts).
      env {
        name        = "METRICS_TOKEN"
        secret_name = "metrics-token"
      }
      # No AZURE_STORAGE_KEY — managed-identity mode. AZURE_CLIENT_ID tells
      # DefaultAzureCredential which user-assigned identity to use.
      env {
        name  = "AZURE_CLIENT_ID"
        value = module.onboard.identity_client_id
      }
      env {
        name  = "AZURE_STORAGE_ACCOUNT"
        value = azurerm_storage_account.media.name
      }
      env {
        name  = "AZURE_STORAGE_CONTAINER"
        value = azurerm_storage_container.media.name
      }
      env {
        name        = "FACEBOOK_CLIENT_ID"
        secret_name = "facebook-client-id"
      }
      env {
        name        = "FACEBOOK_CLIENT_SECRET"
        secret_name = "facebook-client-secret"
      }
      # Public base URL so Auth.js builds correct OAuth callback URLs (otherwise
      # it derives 0.0.0.0:3000). Switch to the custom domain once it's bound.
      env {
        name  = "AUTH_URL"
        value = var.auth_url
      }
      env {
        name  = "AUTH_TRUST_HOST"
        value = "1"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      # Health probes — because min_replicas > 0 means a warm replica is in the
      # routing pool, gate traffic on readiness so a still-booting (or unhealthy)
      # replica isn't sent requests. The app exposes /api/health (liveness) and
      # /api/ready (readiness). port = 3000 matches the ingress target_port.
      #
      # startup: don't start liveness/readiness until the Next server has booted
      # (covers the cold-start window on a fresh replica during scale-out).
      startup_probe {
        transport        = "HTTP"
        port             = 3000
        path             = "/api/ready"
        initial_delay    = 5
        interval_seconds = 5
        timeout          = 3
      }
      # readiness: keep a not-yet-ready replica OUT of the ingress rotation.
      readiness_probe {
        transport        = "HTTP"
        port             = 3000
        path             = "/api/ready"
        initial_delay    = 3
        interval_seconds = 10
        timeout          = 3
      }
      # liveness: restart a wedged replica that stops answering /api/health.
      liveness_probe {
        transport        = "HTTP"
        port             = 3000
        path             = "/api/health"
        initial_delay    = 10
        interval_seconds = 15
        timeout          = 3
      }
    }
  }
}
