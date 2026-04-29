variable "aws_region" {
  description = "AWS region to deploy into. us-east-1 has the cheapest spot prices for t4g.small."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Short project tag applied to every resource; also used for Name tags and security-group names."
  type        = string
  default     = "seald"
}

variable "instance_type" {
  description = "EC2 instance type. t4g.small (ARM64, 2 vCPU, 2 GiB) is the sweet spot for this workload."
  type        = string
  default     = "t4g.small"
}

variable "spot_max_price" {
  description = "Max hourly USD willing to pay for spot. Leave empty to use the on-demand cap (AWS default)."
  type        = string
  default     = ""
}

variable "ssh_pubkey" {
  description = "Your SSH public key, used to create the EC2 key pair. `cat ~/.ssh/id_ed25519.pub` or similar."
  type        = string
  sensitive   = false
}

variable "ssh_ingress_cidrs" {
  description = "Source CIDRs allowed to reach port 22. Keep to your admin IPs; use 0.0.0.0/0 only as a break-glass."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "ami_id" {
  description = "Override the default Ubuntu 22.04 arm64 AMI lookup. Leave empty to use the latest Canonical image."
  type        = string
  default     = ""
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB. 20 is enough for the compiled app + caddy caches + a handful of ephemeral PDFs."
  type        = number
  default     = 20
}

variable "tags" {
  description = "Extra tags to merge onto every resource."
  type        = map(string)
  default     = {}
}

# ---------- Sealing KMS (PAdES signing) ----------

variable "enable_kms_sealing" {
  description = <<-EOT
    Provision the production PAdES sealing key (RSA-3072 SIGN_VERIFY)
    via modules/sealing-kms. Default true so prod gets it on first
    apply; flip to false in non-prod tfvars (staging, dev, ephemeral
    review envs) to avoid the per-key/month KMS charge and the
    30-day deletion window when tearing down.
  EOT
  type        = bool
  default     = true
}

variable "sealing_environment" {
  description = "Environment slug fed into the sealing-kms module (alias suffix + tags). Defaults to `prod` because that's the only env the seal currently runs in."
  type        = string
  default     = "prod"
}

variable "sealing_api_role_name" {
  description = <<-EOT
    Name of the IAM role attached to the API runtime that should be
    granted kms:Sign + kms:GetPublicKey on the sealing key. Leave
    empty to provision the policy without attaching — the EC2 spot
    instance currently runs with static credentials, so attachment
    is deferred until the migration to an instance profile.
  EOT
  type        = string
  default     = ""
}

# ---------- GoDaddy DNS (optional) ----------

variable "godaddy_enabled" {
  description = "Set to true to create the A record at GoDaddy automatically. Requires a production-tier GoDaddy API key (free dev keys only work against OTE)."
  type        = bool
  default     = false
}

variable "godaddy_api_key" {
  description = "GoDaddy API key. Generate at https://developer.godaddy.com/keys. Production tier only - you must have 10+ domains OR a Discount Domain Club membership."
  type        = string
  default     = ""
  sensitive   = true
}

variable "godaddy_api_secret" {
  description = "GoDaddy API secret, paired with godaddy_api_key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "godaddy_domain" {
  description = "Your GoDaddy-managed domain (e.g. nromomentum.com). No leading @."
  type        = string
  default     = ""
}

variable "godaddy_subdomain" {
  description = "Subdomain to point at the EIP. Supports nested forms like 'api.seald' -> api.seald.<domain>. Use @ for apex (HTTPS on apex has extra CAA considerations)."
  type        = string
  default     = "api.seald"
}

variable "godaddy_web_subdomain" {
  description = <<-EOT
    Subdomain for the canonical web surface (landing + SPA, hosted on
    Cloudflare Pages via the seald-landing project). A CNAME is created
    pointing this name -> godaddy_web_cname_target. Set to empty string
    to skip the CNAME (e.g. during DNS migration).
  EOT
  type        = string
  default     = "seald"
}

variable "godaddy_web_cname_target" {
  description = <<-EOT
    CNAME target for the web subdomain. Defaults to the auto-generated
    Cloudflare Pages hostname for the `seald-landing` project. If you
    rename the Pages project, update this.
  EOT
  type        = string
  default     = "seald-landing.pages.dev"
}

variable "godaddy_record_ttl" {
  description = "DNS TTL in seconds for the Seald A record. 600 is a good default - short enough to retry fast if you ever need to move."
  type        = number
  default     = 600
}

variable "extra_a_records" {
  description = <<-EOT
    Additional A records that should coexist on the GoDaddy zone
    alongside Seald's api.seald record. Required because the
    n3integration/godaddy provider replaces every A record on apply;
    anything not listed here (or under godaddy_subdomain) is DELETED.

    Shape: list<object({ name = string, data = string, ttl = optional(number) })>

    Default ships with n8n.nromomentum.com -> the known n8n EIP so a
    stock `terraform apply` doesn't clobber the n8n service sharing
    this zone.
  EOT
  type = list(object({
    name = string
    data = string
    ttl  = optional(number, 3600)
  }))
  default = [
    {
      name = "n8n"
      data = "3.23.247.245" # EIP of the NRO n8n instance
      ttl  = 3600
    },
  ]
}
