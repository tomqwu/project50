output "app_url" {
  description = "Public HTTPS URL of the deployed web app."
  value       = "https://${azurerm_container_app.web.ingress[0].fqdn}"
}

output "resource_group_name" {
  value = module.onboard.resource_group_name
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.db.fqdn
}

output "storage_account_name" {
  value = azurerm_storage_account.media.name
}

output "acr_image" {
  description = "Full image reference the Container App pulls."
  value       = "${module.onboard.acr_login_server}/project50-web:${var.image_tag}"
}
