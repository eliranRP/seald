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

  # Seald Web (landing + SPA) is now served by Cloudflare Pages —
  # see the cname_records resource below. This block previously
  # pointed seald.nromomentum.com → EIP for the EC2 Caddy SPA, but
  # that path was retired on 2026-04-25.

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

  # The n3integration/godaddy provider treats the `record` set as
  # AUTHORITATIVE — every record on the zone that isn't enumerated
  # here gets DELETED on apply (see header comment lines 3-16). In
  # practice the operator adds records directly via the GoDaddy
  # console (DKIM, DMARC, MX, GSC verification, n8n integration,
  # SES feedback, etc.) and we cannot — and should not — keep this
  # config in lockstep.
  #
  # `ignore_changes = [record]` makes TF stop reconciling the record
  # set after the resource is created. Records added/removed outside
  # of TF survive untouched. The trade-off: if you later need to
  # change `var.godaddy_subdomain` or the EIP that api.seald points
  # at, you must do it manually in the GoDaddy console (or
  # temporarily remove this lifecycle block, apply, then add it back).
  lifecycle {
    ignore_changes = [record]
  }
}

# ---------------------------------------------------------------
# Cloudflare Pages CNAME for the canonical web surface.
#
# `seald.nromomentum.com` now resolves to the Cloudflare Pages
# project `seald-landing` (auto-named `seald-landing.pages.dev`),
# which holds the merged build of the Astro landing page (`/`) and
# the React SPA (every other route, via `_redirects`). Built +
# deployed by `.github/workflows/deploy-cloudflare.yml`.
#
# Note: the n3integration/godaddy provider creates one resource per
# record TYPE. The A-records resource above and this CNAME resource
# manage disjoint sets, so they don't clobber each other.
# ---------------------------------------------------------------

resource "godaddy_domain_record" "cname_records" {
  count = var.godaddy_enabled && var.godaddy_web_subdomain != "" ? 1 : 0

  domain = var.godaddy_domain

  record {
    type = "CNAME"
    name = var.godaddy_web_subdomain
    data = var.godaddy_web_cname_target
    ttl  = var.godaddy_record_ttl
  }

  # Same authoritative-set caveat as a_records above. Freeze the
  # record set against TF-driven reconciliation so console-managed
  # CNAMEs (e.g. _domainconnect, dev subdomains) survive.
  lifecycle {
    ignore_changes = [record]
  }
}
