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

# ── Secrets (generated; stored in the per-app Key Vault) ────────────────────
resource "random_password" "db_admin" {
  length           = 28
  special          = true
  override_special = "-_." # Postgres-safe specials (avoid URL-breaking chars)
}

resource "random_password" "auth_secret" {
  length  = 48
  special = false
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

# ── Deployer Key Vault access ───────────────────────────────────────────────
# The principal running `terraform apply` needs to WRITE secrets into the
# RBAC-mode per-app Key Vault. The onboard module grants the app's UAMI read
# access, but not the deployer — so grant it here (captured in code, not a
# manual `az role assignment`), then wait for RBAC to propagate before the
# secret writes below (data-plane RBAC is eventually-consistent — without the
# wait the first apply races the grant and 403s).
data "azurerm_client_config" "current" {}

resource "azurerm_role_assignment" "deployer_kv_secrets" {
  scope                = module.onboard.key_vault_id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "time_sleep" "kv_rbac_propagation" {
  depends_on      = [azurerm_role_assignment.deployer_kv_secrets]
  create_duration = "60s"
}

# ── Secrets in Key Vault (UAMI already has Key Vault Secrets User via onboard)
# The APP connects as the least-privilege "p50app" role (CRUD on public schema,
# NOT a superuser/owner). The role + grants are created by the SQL bootstrap in
# infra/azure/sql/app-role.sql (run by the deployer as admin — the postgresql TF
# provider can't reach the firewalled Azure DB at plan-time). var.app_db_password
# is the password set there; it lives in Key Vault, not in TF state.
resource "azurerm_key_vault_secret" "database_url" {
  depends_on = [time_sleep.kv_rbac_propagation]
  name       = "database-url"
  value = format(
    "postgresql://p50app:%s@%s:5432/%s?sslmode=require",
    urlencode(var.app_db_password),
    azurerm_postgresql_flexible_server.db.fqdn,
    azurerm_postgresql_flexible_server_database.app.name,
  )
  key_vault_id = module.onboard.key_vault_id
}

# Admin connection — used ONLY by the deployer for `prisma migrate deploy` and
# the role bootstrap, never by the running app. Kept in Key Vault for the runbook.
resource "azurerm_key_vault_secret" "database_url_admin" {
  depends_on = [time_sleep.kv_rbac_propagation]
  name       = "database-url-admin"
  value = format(
    "postgresql://%s:%s@%s:5432/%s?sslmode=require",
    var.db_admin_login,
    urlencode(random_password.db_admin.result),
    azurerm_postgresql_flexible_server.db.fqdn,
    azurerm_postgresql_flexible_server_database.app.name,
  )
  key_vault_id = module.onboard.key_vault_id
}

resource "azurerm_key_vault_secret" "auth_secret" {
  name         = "auth-secret"
  value        = random_password.auth_secret.result
  key_vault_id = module.onboard.key_vault_id
}

# (No storage-key secret — the app uses its managed identity for Blob access.)

# ── Container Apps Environment (logs → platform LAW) ────────────────────────
resource "azurerm_container_app_environment" "env" {
  name                       = "cae-project50-dev"
  resource_group_name        = module.onboard.resource_group_name
  location                   = module.onboard.location
  log_analytics_workspace_id = module.onboard.log_analytics_workspace_id
  tags                       = module.onboard.tags
}

# ── The web app (scale-to-zero) ─────────────────────────────────────────────
resource "azurerm_container_app" "web" {
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

  # Secrets sourced from Key Vault via the UAMI.
  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url.id
    identity            = module.onboard.identity_id
  }
  secret {
    name                = "auth-secret"
    key_vault_secret_id = azurerm_key_vault_secret.auth_secret.id
    identity            = module.onboard.identity_id
  }
  # OAuth provider credentials. The VALUES are set out-of-band in Key Vault
  # (az keyvault secret set), NOT managed by Terraform — we reference the
  # versionless secret URI so no credential ever lands in TF state.
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
    min_replicas = 0
    max_replicas = 2

    container {
      name   = "web"
      image  = "${module.onboard.acr_login_server}/project50-web:${var.image_tag}"
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
    }
  }
}
