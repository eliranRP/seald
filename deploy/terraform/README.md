# deploy/terraform

Single-node AWS deploy template for Seald. Provisions:

- EC2 spot instance (default `t4g.small`, ARM64 Ubuntu 22.04)
- Elastic IP (so the GoDaddy A record doesn't move)
- Security group (22 / 80 / 443)
- Auto Scaling Group with `min=max=1` so spot reclaims self-heal

Postgres + Storage live on Supabase — not in scope for this module.

DNS is **intentionally out of scope**. GoDaddy's Terraform provider is
unmaintained and rate-limits hard; it's simpler to `terraform apply`, copy
the outputted IP, and paste it into the GoDaddy DNS dashboard by hand.
You'll only do this once per domain.

## First-time use

```bash
cd deploy/terraform

cat > terraform.tfvars <<EOF
ssh_pubkey        = "ssh-ed25519 AAAAC3Nza... you@host"
ssh_ingress_cidrs = ["1.2.3.4/32"]   # your admin IP; 0.0.0.0/0 is break-glass only
aws_region        = "us-east-1"
EOF

terraform init
terraform apply
```

Terraform prints the EIP + ready-to-paste GoDaddy instructions at the end.

## Post-apply on the host

```bash
ssh ubuntu@<public_ip>

# 1. Clone the repo (deploy key or HTTPS token as needed)
git clone https://github.com/<you>/seald /opt/seald
cd /opt/seald

# 2. Configure env
cp apps/api/.env.example apps/api/.env
vim apps/api/.env          # fill in SUPABASE_*, secrets, RESEND_API_KEY, CADDY_DOMAIN

# 3. (Optional) Generate a PAdES signing keypair
apps/api/scripts/generate-dev-p12.sh      # writes to ./secrets/
# → add PDF_SIGNING_LOCAL_P12_PATH / _PASS to .env

# 4. Launch
docker compose up -d --build
```

## Tear-down

```bash
terraform destroy
```

The Elastic IP is freed on destroy — your GoDaddy A record will point at
nothing until you either `apply` again (new IP) or repoint it.
