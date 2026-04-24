# GoDaddy DNS - optional. Only configured when var.godaddy_enabled = true.
#
# IMPORTANT — n3integration/godaddy behaviour:
#   The provider is a ZONE-owner, not a per-record tool. An `apply`
#   replaces the full SET of A records on the domain with whatever this
#   resource declares. That means any A record not listed here gets
#   DELETED on next apply.
#
#   Consequence: this module must enumerate every A record the zone
#   needs. Seald's own api.seald is always emitted; other services
#   that share nromomentum.com (e.g. n8n.nromomentum.com) belong in
#   var.extra_a_records so they survive TF-driven edits.
#
# Rate-limit heads-up: GoDaddy aggressively rate-limits their API. A
# 429 on apply is usually transient - wait a minute and re-run. State
# is idempotent so retries are safe.

provider "godaddy" {
  key    = var.godaddy_api_key
  secret = var.godaddy_api_secret
}

resource "godaddy_domain_record" "a_records" {
  count = var.godaddy_enabled ? 1 : 0

  domain = var.godaddy_domain

  # Seald API -> EIP provisioned by aws_eip.api in main.tf.
  record {
    type = "A"
    name = var.godaddy_subdomain
    data = aws_eip.api.public_ip
    ttl  = var.godaddy_record_ttl
  }

  # Seald Web SPA -> same EIP. Caddy multiplexes on the Host header
  # and serves the static bundle from `/srv/web` (see deploy/Caddyfile
  # and docker-compose.yml). Emitted only when godaddy_web_subdomain
  # is non-empty.
  dynamic "record" {
    for_each = var.godaddy_web_subdomain != "" ? [1] : []
    content {
      type = "A"
      name = var.godaddy_web_subdomain
      data = aws_eip.api.public_ip
      ttl  = var.godaddy_record_ttl
    }
  }

  # Additional zone co-tenants. Declared at module scope so any future
  # TF edit (e.g. seald subdomain change) doesn't clobber them.
  dynamic "record" {
    for_each = var.extra_a_records
    content {
      type = "A"
      name = record.value.name
      data = record.value.data
      ttl  = lookup(record.value, "ttl", 3600)
    }
  }

  depends_on = [aws_eip.api]
}
