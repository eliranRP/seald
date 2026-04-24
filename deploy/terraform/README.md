# deploy/terraform

Single-node AWS deploy template for Seald. Provisions:

- EC2 spot instance (default `t4g.small`, ARM64 Ubuntu 22.04)
- Elastic IP (so the GoDaddy A record doesn't move)
- Security group (22 / 80 / 443)
- Auto Scaling Group with `min=max=1` so spot reclaims self-heal

Postgres + Storage live on Supabase — not in scope for this module.

DNS has two modes — choose at apply time via `godaddy_enabled`:

**Manual (default):** `terraform apply`, copy the outputted EIP, paste
it as an A record into the GoDaddy DNS dashboard by hand. One-time per
domain.

**Managed (`godaddy_enabled = true`):** Terraform creates / updates the
A record for you via the community `n3integration/godaddy` provider.
Requires a production-tier GoDaddy API key — see **GoDaddy credentials**
below.

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

## GoDaddy credentials (managed DNS mode)

Set these five variables if you want Terraform to own the A record:

| tfvar                | Value                                                                     |
| -------------------- | ------------------------------------------------------------------------- |
| `godaddy_enabled`    | `true`                                                                    |
| `godaddy_api_key`    | API key from [developer.godaddy.com/keys](https://developer.godaddy.com/keys) (Production tier). |
| `godaddy_api_secret` | The matching secret shown at key creation.                                |
| `godaddy_domain`     | Your registered domain, e.g. `nromomentum.com` (no leading `@`).          |
| `godaddy_subdomain`  | Subdomain to manage, e.g. `api` → `api.nromomentum.com`. Defaults to `api`. |

Example `terraform.tfvars`:

```hcl
ssh_pubkey        = "ssh-ed25519 AAAAC3… you@host"
ssh_ingress_cidrs = ["1.2.3.4/32"]
aws_region        = "us-east-1"

godaddy_enabled    = true
godaddy_api_key    = "dLhhhhhhh_XXXXXXX"      # paste from GoDaddy
godaddy_api_secret = "YYYYYYYYYYYYYYYY"        # paste from GoDaddy
godaddy_domain     = "nromomentum.com"
godaddy_subdomain  = "api"
```

**Important — API-tier gotcha.** GoDaddy restricts their production API
to accounts that meet ONE of:

1. 10+ active domains in the account, OR
2. A "Discount Domain Club" membership.

Free developer keys only hit their OTE (sandbox) environment and
**will not** update real DNS. If you don't qualify, leave
`godaddy_enabled = false` and update DNS by hand from the GoDaddy
dashboard — it's a 30-second one-time task.

To rotate the key: generate a new one in the GoDaddy dashboard, update
`terraform.tfvars`, `terraform apply`. Delete the old key at GoDaddy
once the new one is confirmed working.

## Tear-down

```bash
terraform destroy
```

The Elastic IP is freed on destroy — your GoDaddy A record will point at
nothing until you either `apply` again (new IP) or repoint it.
