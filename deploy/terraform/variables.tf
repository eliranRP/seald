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

variable "use_spot" {
  description = <<-EOT
    Provision the API instance as a spot instance (cheaper, ~$5/mo) when
    true; on-demand (~$15/mo) when false. Flip to false when the AWS
    account hits MaxSpotInstanceCountExceeded — typically after a
    spot-pool exhaustion event or an account-level quota change.
  EOT
  type        = bool
  default     = false
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

variable "environment_slug" {
  description = <<-EOT
    Deploy environment slug, used as a suffix on environment-scoped
    resource names (e.g. the AWS Secrets Manager entry becomes
    `seald-api-$${environment_slug}`). Defaults to `prod` because the
    hosted EC2 deploy is currently prod-only; staging/review envs
    should override via tfvars.
  EOT
  type        = string
  default     = "prod"
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
    Override the IAM role that gets the kms:Sign + kms:GetPublicKey
    policy attachment on the sealing key. When null (the default), the
    sealing-kms module auto-attaches to aws_iam_role.api.name (the
    instance profile role created in main.tf), which is what prod
    wants — short-lived IMDS credentials, no static keys. Set this to
    a different role name only if you're running the API somewhere
    other than the EC2 instance profile (e.g. ECS task role, a
    separate operator role for ad-hoc signing). Set to empty string
    "" to provision the policy without attaching it to any role.
  EOT
  type        = string
  default     = null
}

# ---------- Google Drive token KMS (envelope encryption for refresh tokens) ----------

variable "enable_gdrive_token_kms" {
  description = <<-EOT
    Provision the symmetric AES-256 KMS key that wraps Google Drive
    OAuth refresh tokens (DriveKmsService envelope encryption). Default
    true so prod gets it on first apply; flip to false in non-prod
    tfvars where the gdriveIntegration feature flag is off (no tokens
    are written, the key would just incur the per-key/month charge).
  EOT
  type        = bool
  default     = true
}

variable "gdrive_token_environment" {
  description = "Environment slug fed into the gdrive-token-kms module (alias suffix + tags). Defaults to `prod` because that's the only env the integration currently runs in."
  type        = string
  default     = "prod"
}

variable "gdrive_token_api_role_name" {
  description = <<-EOT
    Override the IAM role that gets the kms:GenerateDataKey + kms:Decrypt
    policy attachment on the Drive token wrapping key. When null (the
    default), the gdrive-token-kms module auto-attaches to
    aws_iam_role.api.name (the instance profile role created in
    main.tf). Set this to a different role name only if you're running
    the API somewhere other than the EC2 instance profile. Set to
    empty string "" to provision the policy without attaching it.
  EOT
  type        = string
  default     = null
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
