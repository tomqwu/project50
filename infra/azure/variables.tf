variable "alert_email" {
  description = "Email address that receives Azure Monitor alerts (action group + metric alerts in monitoring.tf). Left EMPTY by default: with no email the action group and every alert are count-gated to zero, so `terraform apply` creates nothing new and the deploy plan stays clean. Activate alerting by passing `-var alert_email=ops@example.com` at apply time."
  type        = string
  default     = ""
}

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
  description = "Password for the least-privilege 'p50app' role the app connects as (created by infra/azure/sql/app-role.sql). No longer consumed by Terraform — the `database-url` secret is now set out of band via `az keyvault secret set` (see README runbook), keeping the value out of TF state. Retained as an optional input so the deploy script can thread it through to the out-of-band secret-set step; safe to omit from `terraform apply`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "auth_url" {
  description = "Public base URL of the deployed app — Auth.js uses it to build OAuth callback URLs. The custom domain project50.fit (apply this only after the hostname is bound + cert provisioned)."
  type        = string
  default     = "https://project50.fit"
}
