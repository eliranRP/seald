output "public_ip" {
  description = "Elastic IP of the Seald node. Create an A record at GoDaddy pointing your API subdomain (CADDY_DOMAIN) at this."
  value       = aws_eip.api.public_ip
}

output "ssh_command" {
  description = "Ready-to-paste SSH command to reach the instance once cloud-init finishes (~90s after apply)."
  value       = "ssh ubuntu@${aws_eip.api.public_ip}"
}

output "godaddy_dns_instructions" {
  description = "Copy-paste these steps into the GoDaddy DNS dashboard after terraform apply completes."
  value       = <<-EOT
    1. Log into GoDaddy → "My Products" → select your domain → "DNS".
    2. Add / edit the A record for your API subdomain:
         Type : A
         Name : api           (or whatever subdomain matches CADDY_DOMAIN)
         Data : ${aws_eip.api.public_ip}
         TTL  : 600 seconds   (low enough to retry fast if you ever need to move)
    3. Wait ~1-2 minutes for propagation.
    4. On the host: fill apps/api/.env (CADDY_DOMAIN=api.<your-domain>),
       then `docker compose up -d --build`. Caddy issues the Let's Encrypt
       cert automatically on the first HTTPS hit.
  EOT
}
