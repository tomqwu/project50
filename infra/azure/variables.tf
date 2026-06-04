variable "image_tag" {
  description = "Container image tag in the platform ACR (repo: project50-web). Set to the release tag (e.g. v2026.06.04.3) or a commit SHA at deploy time."
  type        = string
  default     = "latest"
}

variable "db_admin_login" {
  description = "Postgres administrator login name."
  type        = string
  default     = "p50admin"
}

variable "app_db_password" {
  description = "Password for the least-privilege 'p50app' role the app connects as. Created by infra/azure/sql/app-role.sql; pass at apply via -var (kept out of TF state). Required."
  type        = string
  sensitive   = true
}
