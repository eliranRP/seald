# Sealing KMS — provisioning runbook

End-to-end procedure for standing up the AWS KMS RSA-3072 SIGN_VERIFY
key that backs `KmsPadesSigner` (apps/api/src/sealing/pades-signer.ts).
Read this in full before the first apply; the steps are idempotent
once the key exists, but the **30-day deletion window** makes a wrong
move expensive.

> **TL;DR:** apply the Terraform module → run `pnpm --filter api
> kms:gen-cert` → drop the PEM and three env vars on the API host →
> `docker compose restart api`.

---

## 1. Prerequisites

| Item | Notes |
|---|---|
| AWS creds with `kms:CreateKey`, `kms:CreateAlias`, `iam:CreatePolicy` | Apply runs once; afterwards the API role only needs `kms:Sign` + `kms:GetPublicKey`. |
| Terraform ≥ 1.6.0 | Match the CI pin (1.8.5) when possible. |
| `pnpm` + Node 20 + `ts-node` | Required to run the cert generator script. |
| Repo checkout at the branch that has `modules/sealing-kms` merged | The root `main.tf` only reads it through `module "sealing_kms"`. |
| Sealing env decided | The module names everything `seald-pades-sealing-<env>`. Stick to `prod`. |

State backend: the existing `.github/workflows/terraform.yml` already
configures the S3 backend + DynamoDB lock. For local plans run
`terraform init -backend=false`.

---

## 2. Plan + apply

```sh
cd deploy/terraform

terraform fmt -check -recursive
terraform validate

# CI normally runs the apply on push; for a manual run:
gh workflow run terraform.yml --ref main -f action=plan
gh workflow run terraform.yml --ref main -f action=apply
```

What gets created on first apply (`var.enable_kms_sealing = true`,
default for prod):

| Resource | Identifier |
|---|---|
| `aws_kms_key.sealing` | RSA-3072 SIGN_VERIFY, 30-day deletion window |
| `aws_kms_alias.sealing` | `alias/seald-pades-sealing-prod` |
| `aws_iam_policy.api_kms_sign` | `seald-pades-sealing-prod-sign` |
| `aws_iam_role_policy_attachment.api_kms_sign` *(conditional)* | Attached only when `var.sealing_api_role_name != ""` |

Charges: ~$1/month per asymmetric KMS key + per-API-call usage. At
expected seal volumes (≪ 10 k seals/month) total spend stays under $5.

---

## 3. Capture the outputs

Fetch the values the API and cert-generator script need:

```sh
terraform -chdir=deploy/terraform output -raw sealing_kms_key_id
terraform -chdir=deploy/terraform output -raw sealing_kms_alias
terraform -chdir=deploy/terraform output -raw sealing_kms_region
terraform -chdir=deploy/terraform output -raw sealing_kms_iam_policy_arn
```

Note them in 1Password under "Seald — production secrets" alongside
the existing Caddy / Supabase entries.

---

## 4. Generate the binding certificate

The cert binds the KMS public key to a human-readable subject
("Seald PAdES Sealing"). It is signed *by the KMS key itself*, so the
chain is exactly one cert deep — verifiers like Adobe Reader and EU
DSS will mark the chain as untrusted unless the operator pins the
cert in their trust store. We surface the cert in the audit pack so
end-recipients can do that.

From a workstation with prod AWS creds (or a CI runner with the
attached IAM policy):

```sh
mkdir -p apps/api/.local
pnpm --filter api kms:gen-cert -- \
  --key-id alias/seald-pades-sealing-prod \
  --region us-east-1 \
  --out apps/api/.local/seald-pades-prod.crt.pem \
  --cn "Seald PAdES Sealing" \
  --org "Seald" \
  --country US \
  --years 5
```

The script:

1. `kms:DescribeKey` — sanity-checks `RSA_3072` + `SIGN_VERIFY`.
2. `kms:GetPublicKey` — fetches the SubjectPublicKeyInfo.
3. Builds an X.509 v3 cert with that public key and your subject DN.
4. SHA-256 hashes the tbsCertificate.
5. `kms:Sign(MessageType=DIGEST, RSASSA_PKCS1_V1_5_SHA_256)`.
6. Wraps the signature into the cert and writes a PEM at `--out`.

Keep the PEM. Lose it and you have to re-issue (the *cert*, not the
key — the key is reusable).

### LocalStack smoke test (optional)

LocalStack's pro tier supports asymmetric KMS; the community edition
returns a stub. For smoke purposes:

```sh
docker run --rm -d -p 4566:4566 -e SERVICES=kms localstack/localstack-pro
aws --endpoint-url=http://localhost:4566 kms create-key \
  --customer-master-key-spec RSA_3072 --key-usage SIGN_VERIFY
# copy KeyId, then:
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
  pnpm --filter api kms:gen-cert -- \
    --key-id <key-id> --region us-east-1 \
    --out /tmp/local.crt.pem
```

Skip this step if LocalStack pro isn't available — it does not gate
the runbook.

---

## 5. Wire env on the API host

SSH to the production EC2 host and edit `/opt/seald/apps/api/.env`:

```env
PDF_SIGNING_PROVIDER=kms
PDF_SIGNING_KMS_KEY_ID=alias/seald-pades-sealing-prod
PDF_SIGNING_KMS_REGION=us-east-1
PDF_SIGNING_KMS_CERT_PEM_PATH=/opt/seald/secrets/seald-pades-prod.crt.pem
```

Copy the PEM to the host:

```sh
scp apps/api/.local/seald-pades-prod.crt.pem \
  ubuntu@api.seald.nromomentum.com:/opt/seald/secrets/seald-pades-prod.crt.pem
ssh ubuntu@api.seald.nromomentum.com 'sudo chown root:root /opt/seald/secrets/seald-pades-prod.crt.pem && sudo chmod 0640 /opt/seald/secrets/*.pem'
```

Restart the API container so `KmsPadesSigner` re-initialises:

```sh
ssh ubuntu@api.seald.nromomentum.com 'cd /opt/seald && docker compose restart api'
```

Verify the log line:

```
[Nest] LOG  KmsPadesSigner — KMS signer ready: key=alias/seald-pades-sealing-prod region=us-east-1 subject="Seald PAdES Sealing" TSA=enabled
```

---

## 6. Rotation

Asymmetric KMS keys cannot be auto-rotated by AWS; rotation is a
human-driven re-key. When you do rotate (cert expiry, suspected
compromise, or the planned 5-year cadence):

1. Apply a *second* sealing module instance with a fresh `environment`
   slug (e.g. `prod-2027`) — both keys coexist while you migrate.
2. Generate a new cert (`kms:gen-cert`) against the new key id.
3. Flip the API env vars to point at the new key+cert. Restart.
4. Smoke-test by signing one document and running
   `pnpm --filter api ts-node scripts/verify-pades.ts <dir>`.
5. After ≥ 30 days (so any in-flight signed PDFs can still be verified
   against the public key on the *old* key), delete the old module
   block. Terraform schedules deletion with the 30-day window — the
   key isn't actually destroyed until day 30, recoverable until then
   via `aws kms cancel-key-deletion`.

---

## 7. Deletion (last resort)

```sh
# Tear down the entire sealing key. PAdES signatures previously made
# against this key remain VERIFIABLE only as long as relying parties
# already have the binding cert pinned — the public key disappears
# from KMS once the deletion window elapses.
terraform -chdir=deploy/terraform apply \
  -var enable_kms_sealing=false
```

Until day 30:
```sh
aws kms cancel-key-deletion --key-id <key-id>
```
restores the key fully.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `KmsPadesSigner: cannot read cert PEM at ...` | Path inside the container differs from the host path. Mount it via `docker-compose.yml` or copy under the bind-mounted `secrets/` dir. |
| `kms:Sign returned no Signature` | API role missing the policy. Re-check `terraform output sealing_kms_iam_policy_arn` is attached to the running role. |
| `KMS key ... has spec=...; expected RSA_3072` | Wrong `--key-id`. The script targets a non-sealing key (e.g. data-key). |
| TSA fallback to B-B in logs | Not a KMS issue; check `PDF_SIGNING_TSA_URL` reachability. |
