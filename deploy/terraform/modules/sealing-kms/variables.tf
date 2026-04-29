variable "environment" {
  description = "Deployment environment slug — appears in the alias (`alias/seald-pades-sealing-<env>`) and in tags. Use `prod`, `staging`, etc."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be 2-16 chars, lowercase alphanumeric + hyphen, starting with a letter."
  }
}

variable "api_role_name" {
  description = <<-EOT
    Name (not ARN) of the IAM role attached to the API runtime
    (EC2 instance profile or ECS task role). The kms:Sign + kms:GetPublicKey
    policy is attached to this role. Pass empty string ("") to provision the
    policy but skip attachment — useful on first apply when no role exists yet.
  EOT
  type        = string
  default     = ""
}

variable "tags" {
  description = "Extra tags to merge onto every resource the module creates. Only applied when var.enable_resource_tags is true."
  type        = map(string)
  default     = {}
}

variable "enable_resource_tags" {
  description = <<-EOT
    Whether to set tags on the KMS key + alias resources.

    Tagging a KMS key requires the caller's IAM principal to hold
    `kms:TagResource` on the resource. Many CI roles only have the bare
    `kms:CreateKey` / `kms:CreateAlias` minimum and would fail apply with
    AccessDeniedException on first run. Default false so a fresh deploy
    succeeds even with the minimum perms; flip to true once `kms:TagResource`
    is granted to the deployer (and re-run apply to attach tags).
  EOT
  type        = bool
  default     = false
}
