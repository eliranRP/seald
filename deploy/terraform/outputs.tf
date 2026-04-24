output "public_ip" {
  description = "Elastic IP of the Seald node. Create an A record at GoDaddy pointing your API subdomain (CADDY_DOMAIN) at this."
  value       = aws_eip.api.public_ip
}

output "ssh_command" {
  description = "Ready-to-paste SSH command to reach the instance once cloud-init finishes (~90s after apply)."
  value       = "ssh ubuntu@${aws_eip.api.public_ip}"
}

output "godaddy_dns_instructions" {
  description = "DNS setup instructions. If godaddy_enabled is true, Terraform already wrote the A record for you. If false, paste this into the GoDaddy DNS dashboard after apply."
  value = var.godaddy_enabled ? <<-EOT
    ✓ GoDaddy A record managed by Terraform:
        ${var.godaddy_subdomain}.${var.godaddy_domain}  A  ${aws_eip.api.public_ip}  TTL ${var.godaddy_record_ttl}s
    Propagation: ~1-2 minutes. Verify with: dig ${var.godaddy_subdomain}.${var.godaddy_domain} +short
    EOT : <<-EOT
    Manual DNS setup (godaddy_enabled = false):
    1. Log into GoDaddy → "My Products" → select your domain → "DNS".
    2. Add / edit the A record:
         Type : A
         Name : api           (or whatever matches CADDY_DOMAIN)
         Data : ${aws_eip.api.public_ip}
         TTL  : 600
    3. Wait ~1-2 minutes for propagation.
    4. On the host: fill apps/api/.env (CADDY_DOMAIN=api.<your-domain>),
       then `docker compose up -d --build`. Caddy issues the Let's
       Encrypt cert automatically on the first HTTPS hit.
  EOT
}
