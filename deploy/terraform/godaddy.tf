# GoDaddy DNS - optional. Only configured when var.godaddy_enabled = true.
#
# The provider block is unconditional (Terraform requires it even if no
# resources use the provider), but every resource is gated on
# godaddy_enabled via `count`. If disabled, terraform plan shows zero
# GoDaddy changes.
#
# Heads-up: the `n3integration/godaddy` provider is community-maintained.
# GoDaddy itself does not publish an official Terraform provider and
# rate-limits their API aggressively. If the record update fails with a
# 429, wait a few minutes and re-apply - the state is idempotent.

provider "godaddy" {
  key    = var.godaddy_api_key
  secret = var.godaddy_api_secret
}

resource "godaddy_domain_record" "api" {
  count = var.godaddy_enabled ? 1 : 0

  domain = var.godaddy_domain

  # The provider replaces ALL records of the managed types on apply. We
  # only declare the A record we care about; leaving other record types
  # unmanaged. If you also want to manage MX / CNAME / TXT here, add
  # more `record {}` blocks to this resource.
  record {
    type = "A"
    name = var.godaddy_subdomain
    data = aws_eip.api.public_ip
    ttl  = var.godaddy_record_ttl
  }

  depends_on = [aws_eip.api]
}
