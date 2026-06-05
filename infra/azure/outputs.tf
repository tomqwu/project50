output "app_url" {
  description = "Public HTTPS URL of the deployed web app."
  value       = "https://${azurerm_container_app.web.ingress[0].fqdn}"
}

output "resource_group_name" {
  value = module.onboard.resource_group_name
}

output "postgres_fqdn" {
  description = "Postgres Flexible Server hostname — host part of the database-url / database-url-admin connection strings."
  value       = azurerm_postgresql_flexible_server.db.fqdn
}

output "db_admin_login" {
  description = "Postgres administrator login — user part of the database-url-admin connection string."
  value       = var.db_admin_login
}

# The server administrator password, surfaced so an operator can (re)build the
# `database-url-admin` Key Vault secret out of band (Azure never reveals an
# existing Flexible Server admin password, and there is no other source). This
# does NOT worsen the state-secrets posture: the value is ALREADY unavoidably in
# TF state via `random_password.db_admin` (it is the server's
# `administrator_password` argument, which has no KV-native / write-only form on
# this azurerm version) — this output merely makes the in-state value
# retrievable via `terraform output -raw db_admin_password`. It is the ONLY
# secret value exposed this way; the app's `database-url` (least-priv p50app)
# password comes from the operator-provided value, never from TF.
output "db_admin_password" {
  description = "Postgres administrator password (already in TF state via random_password.db_admin) — used only to assemble the out-of-band database-url-admin KV secret."
  value       = random_password.db_admin.result
  sensitive   = true
}

output "storage_account_name" {
  value = azurerm_storage_account.media.name
}

output "acr_image" {
  description = "Full image reference the Container App pulls."
  value       = "${module.onboard.acr_login_server}/project50-web:${var.image_tag}"
}
