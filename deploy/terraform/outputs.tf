output "public_ip" {
  description = "Elastic IP of the Seald node. Create an A record at GoDaddy pointing your API subdomain (CADDY_DOMAIN) at this."
  value       = aws_eip.api.public_ip
}

output "ssh_command" {
  description = "Ready-to-paste SSH command to reach the instance once cloud-init finishes (~90s after apply)."
  value       = "ssh ubuntu@${aws_eip.api.public_ip}"
}

locals {
  dns_managed_msg = <<-EOT
    ✓ GoDaddy A record managed by Terraform:
        ${var.godaddy_subdomain}.${var.godaddy_domain}  A  ${aws_eip.api.public_ip}  TTL ${var.godaddy_record_ttl}s
    Propagation: ~1-2 minutes. Verify with:
      dig ${var.godaddy_subdomain}.${var.godaddy_domain} +short
  EOT

  dns_manual_msg = <<-EOT
    Manual DNS setup (godaddy_enabled = false):
    1. Log into GoDaddy -> My Products -> select your domain -> DNS.
    2. Add/edit A record:
         Type: A
         Name: api   (or whatever matches CADDY_DOMAIN)
         Data: ${aws_eip.api.public_ip}
         TTL : 600
    3. Wait ~1-2 minutes for propagation.
    4. On the host: fill apps/api/.env (CADDY_DOMAIN=api.<your-domain>),
       then `docker compose up -d --build`. Caddy issues the Let's
       Encrypt cert on the first HTTPS hit.
  EOT
}

output "godaddy_dns_instructions" {
  description = "DNS setup instructions. If godaddy_enabled is true, Terraform already wrote the A record for you. If false, paste the EIP into the GoDaddy DNS dashboard after apply."
  value       = var.godaddy_enabled ? local.dns_managed_msg : local.dns_manual_msg
}

# --------------------------------------------------------------------
# Sealing KMS outputs — surface the values needed by
# apps/api/scripts/generate-kms-binding-cert.ts and the API runtime
# env vars (PDF_SIGNING_KMS_KEY_ID, PDF_SIGNING_KMS_REGION).
# All null when var.enable_kms_sealing = false.
# --------------------------------------------------------------------

output "sealing_kms_key_arn" {
  description = "ARN of the PAdES sealing KMS key. Null when enable_kms_sealing = false."
  value       = var.enable_kms_sealing ? module.sealing_kms[0].key_arn : null
}

output "sealing_kms_key_id" {
  description = "Key id (UUID) for PDF_SIGNING_KMS_KEY_ID. Null when enable_kms_sealing = false."
  value       = var.enable_kms_sealing ? module.sealing_kms[0].key_id : null
}

output "sealing_kms_alias" {
  description = "Stable alias (alias/seald-pades-sealing-<env>) — accepted by KmsPadesSigner in lieu of the key id."
  value       = var.enable_kms_sealing ? module.sealing_kms[0].key_alias : null
}

output "sealing_kms_region" {
  description = "Region the sealing key lives in. Goes into PDF_SIGNING_KMS_REGION."
  value       = var.enable_kms_sealing ? module.sealing_kms[0].region : null
}

output "sealing_kms_iam_policy_arn" {
  description = "ARN of the kms:Sign + kms:GetPublicKey IAM policy. Attach to additional roles as needed."
  value       = var.enable_kms_sealing ? module.sealing_kms[0].iam_policy_arn : null
}

output "api_iam_role_name" {
  description = "Name of the IAM role attached to the API EC2 instance profile. The sealing-kms module attaches its kms:Sign policy to this role by default."
  value       = aws_iam_role.api.name
}
