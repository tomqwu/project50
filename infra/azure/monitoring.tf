# ── Metrics, dashboards & alerts (#271) ─────────────────────────────────────
#
# Azure Monitor metric alerts for the Container App + Postgres, codified so they
# land on the next gated `terraform apply`. EVERYTHING here is guarded on
# `var.alert_email` via a `count` gate (mirroring the env-gating pattern the repo
# uses elsewhere): with `alert_email = ""` (the default) the action group and
# every alert resolve to `count = 0`, so a no-email apply creates ZERO new
# resources and the existing deploy plan stays clean. The operator activates
# alerts by setting `alert_email` in an AUTO-LOADED `alerts.auto.tfvars` (see
# alerts.auto.tfvars.example + README) — NOT a one-shot `-var`. Terraform loads
# `*.auto.tfvars` on every plan/apply, so the value persists across deploys; the
# routine `apply -var image_tag=...` omits the email, so a one-shot `-var` would
# reset the gate to 0 on the next apply and DESTROY the action group + alerts.
#
# This complements the app-level Prometheus endpoint (`/api/metrics`, see
# docs/OBSERVABILITY.md) with platform-level signals Azure Monitor scrapes for
# free from the resource providers — no scraper/Grafana stack required to get
# basic 5xx / DB-saturation paging.
#
# Metric namespaces / names used (verified against the Azure Monitor metric
# catalogue for these resource types):
#   * Container App  — namespace "Microsoft.App/containerApps":
#       - "Requests"      (dimension "statusCodeCategory" ∈ 2xx/3xx/4xx/5xx)
#       - "RestartCount"  (replica restarts)
#     (Container Apps exposes NO server-side latency/percentile metric — see the
#      p95 note below; "ResponseTime" is NOT a Container Apps metric.)
#   * Postgres Flexible Server — namespace
#     "Microsoft.DBforPostgreSQL/flexibleServers":
#       - "cpu_percent"
#       - "storage_percent"
#       - "active_connections"

locals {
  # Single source of truth for the count gate: alerts + action group are created
  # ONLY when an alert email is supplied. `alert_email = ""` ⇒ enabled = 0 ⇒ zero
  # new resources on apply (inert), so this won't surprise the next deploy.
  alerts_enabled = var.alert_email != "" ? 1 : 0
}

# ── Action group: email receiver wired to every alert ───────────────────────
resource "azurerm_monitor_action_group" "ops" {
  count = local.alerts_enabled

  name                = "ag-project50-ops-dev"
  resource_group_name = module.onboard.resource_group_name
  short_name          = "p50ops" # Azure caps this at 12 chars
  tags                = module.onboard.tags

  email_receiver {
    name                    = "ops-email"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}

# ── Container App: 5xx server-error rate ────────────────────────────────────
# Fires when the app returns more than 5 responses in the 5xx class over a 5m
# window (matches the docs/OBSERVABILITY.md HighErrorRate intent, expressed
# against the platform "Requests" metric filtered to the 5xx status class). A
# small absolute count (not a %) is the right shape for a scale-to-zero app with
# low baseline traffic, where a ratio is noisy/undefined at low request volume.
resource "azurerm_monitor_metric_alert" "ca_5xx" {
  count = local.alerts_enabled

  name                = "p50-ca-5xx-errors"
  resource_group_name = module.onboard.resource_group_name
  scopes              = [azurerm_container_app.web.id]
  description         = "Container App returned >5 HTTP 5xx responses over 5 minutes."
  severity            = 1 # Sev1 = error: users seeing server errors
  frequency           = "PT1M"
  window_size         = "PT5M"
  auto_mitigate       = true

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "Requests"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 5

    dimension {
      name     = "statusCodeCategory"
      operator = "Include"
      values   = ["5xx"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops[0].id
  }

  tags = module.onboard.tags
}

# ── Container App: replica restarts (crash-loop / OOM proxy) ─────────────────
# RestartCount climbing signals replicas crash-looping (OOM, unhandled crash,
# failing liveness). >3 restarts over 15m is well past normal scale-to-zero
# churn (a cold start is a fresh replica, not a restart) and worth a look.
resource "azurerm_monitor_metric_alert" "ca_restarts" {
  count = local.alerts_enabled

  name                = "p50-ca-replica-restarts"
  resource_group_name = module.onboard.resource_group_name
  scopes              = [azurerm_container_app.web.id]
  description         = "Container App replicas restarted >3 times over 15 minutes (crash-loop / OOM?)."
  severity            = 2 # Sev2 = warning: degraded, not necessarily user-facing yet
  frequency           = "PT5M"
  window_size         = "PT15M"
  auto_mitigate       = true

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "RestartCount"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 3
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops[0].id
  }

  tags = module.onboard.tags
}

# ── Postgres: CPU percent high ──────────────────────────────────────────────
# B1ms is a burstable 2-vCPU SKU; sustained >80% CPU over 15m means it's running
# out of burst credits and queries will start to queue.
resource "azurerm_monitor_metric_alert" "pg_cpu" {
  count = local.alerts_enabled

  name                = "p50-pg-cpu-high"
  resource_group_name = module.onboard.resource_group_name
  scopes              = [azurerm_postgresql_flexible_server.db.id]
  description         = "Postgres CPU >80% over 15 minutes."
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  auto_mitigate       = true

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "cpu_percent"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops[0].id
  }

  tags = module.onboard.tags
}

# ── Postgres: storage percent high ──────────────────────────────────────────
# Auto-grow is on (main.tf), but it bumps in steps and can lag a fast fill; >85%
# is an early warning to check growth before the volume (or auto-grow ceiling)
# is hit. 1h window because storage moves slowly — no need for a tight window.
resource "azurerm_monitor_metric_alert" "pg_storage" {
  count = local.alerts_enabled

  name                = "p50-pg-storage-high"
  resource_group_name = module.onboard.resource_group_name
  scopes              = [azurerm_postgresql_flexible_server.db.id]
  description         = "Postgres storage >85% used over 1 hour."
  severity            = 2
  frequency           = "PT15M"
  window_size         = "PT1H"
  auto_mitigate       = true

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "storage_percent"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops[0].id
  }

  tags = module.onboard.tags
}

# ── Postgres: active connections high ───────────────────────────────────────
# B1ms caps at ~35 max_connections, so the alert MUST fire BELOW the cap —
# Postgres refuses new connections at the limit, so a threshold at/above ~35
# could never trigger (the saturation it's meant to warn about manifests as
# refused connections, not a higher count). >25 (~70% of ~35) gives headroom to
# page before the pool saturates. Maximum aggregation (not Average) so a
# sustained peak isn't smoothed away.
resource "azurerm_monitor_metric_alert" "pg_connections" {
  count = local.alerts_enabled

  name                = "p50-pg-active-connections-high"
  resource_group_name = module.onboard.resource_group_name
  scopes              = [azurerm_postgresql_flexible_server.db.id]
  description         = "Postgres active connections >25 over 15 minutes (~70% of the ~35 B1ms cap — paging before saturation)."
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  auto_mitigate       = true

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "active_connections"
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 25
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops[0].id
  }

  tags = module.onboard.tags
}

# ── NOT codified here (deliberate — real resources only, no fakes) ──────────
#
# p95 LATENCY: Container Apps exposes no server-side latency/percentile metric in
# the "Microsoft.App/containerApps" namespace (no "ResponseTime"), so there is no
# clean azurerm_monitor_metric_alert for p95. Real options are a follow-up:
#   (a) the app's own `http_request_duration_ms` histogram (/api/metrics) scraped
#       into Azure Monitor / Prometheus and alerted there (see OBSERVABILITY.md
#       HighLatencyP95), or
#   (b) a Front Door / App Gateway in front of the app, which DOES emit latency
#       percentiles. Neither exists today, so we don't fake a latency alert.
#
# UPTIME / CERT-EXPIRY: classic Application Insights availability (web) tests
# (azurerm_application_insights_web_test) are retired by Azure, and Standard web
# tests need an Application Insights component this stack doesn't provision. So
# black-box uptime of /api/health + managed-cert-expiry monitoring is a follow-up
# (external checker — UptimeRobot / Grafana Synthetics, see OBSERVABILITY.md §3),
# not faked here.
