variable "alert_email" {
  description = "Email address that receives Azure Monitor alerts (action group + metric alerts in monitoring.tf). Left EMPTY by default: with no email the action group and every alert are count-gated to zero, so `terraform apply` creates nothing new and the deploy plan stays clean. Activate alerting by setting it in an auto-loaded `infra/azure/alerts.auto.tfvars` (see alerts.auto.tfvars.example) so it PERSISTS across applies — do NOT pass it as a one-shot `-var`, or the next routine `apply -var image_tag=...` (which omits it) would reset the gate to 0 and destroy the alerts."
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
  description = "Public base URL of the deployed app — Auth.js uses it to build OAuth callback URLs. Defaults to the CANONICAL host https://www.project50.fit (the apex project50.fit 301-redirects to www — see README #291). OAuth callbacks are registered for www, so www MUST be the default: a routine `terraform apply -var image_tag=...` without an auth_url override is then correct. Do NOT default this to the apex — that would build apex callback URLs and break OAuth once the apex→www redirect is in place."
  type        = string
  default     = "https://www.project50.fit"
}

variable "min_replicas" {
  description = "Minimum number of Container App replicas to keep running. Default 1 keeps ONE small replica always warm so the first request after idle skips the multi-second cold start (the Next.js standalone server boot). COST TRADEOFF: at min 1 that single replica runs 24/7 (~0.5 vCPU + 1Gi) and bills active-usage rates against the Azure Sponsorship credits instead of scaling to zero at idle. Set to 0 (e.g. `-var min_replicas=0`) to restore scale-to-zero (no idle cost, but cold starts return)."
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "Maximum number of Container App replicas. The app scales OUT from min_replicas toward this ceiling under concurrent load (driven by the http_scale_rule), then back down to min_replicas when idle. Default 4 gives headroom above the warm baseline for traffic spikes."
  type        = number
  default     = 4
}
