# --------------------------------------------------------------------
# AWS Secrets Manager — runtime config for the API container.
#
# The Seald API used to read every secret (DATABASE_URL, Supabase
# service role, JWT/CRON/METRICS secrets, RESEND_API_KEY, ...) from a
# host-side `apps/api/.env` file written by `.github/workflows/prod-restore.yml`
# from the GH `PROD_API_ENV` secret. That works but couples secret
# rotation to a redeploy, leaks values into the GH Actions log surface,
# and forces every host that holds the .env file to be in scope for
# secret hygiene.
#
# This file provisions a single Secrets Manager entry that the
# container fetches at boot via `aws secretsmanager get-secret-value`,
# parses with `jq`, and exports as env vars (only when the variable is
# unset — i.e. local docker-compose env_file values still win). See
# apps/api/scripts/entrypoint.sh for the fetch+parse logic.
#
# IMPORTANT: this Terraform ships the *resource* and *least-privilege
# IAM policy* — it does NOT ship secret values. The initial
# `aws_secretsmanager_secret_version` is a JSON `{}` placeholder.
# After `terraform apply`, an operator populates real values out-of-band:
#
#   aws secretsmanager put-secret-value \
#     --secret-id seald-api-prod \
#     --region us-east-1 \
#     --secret-string file://secrets.json
#
# (`secrets.json` should be a flat object: { "DATABASE_URL": "...",
# "SUPABASE_SERVICE_ROLE_KEY": "...", ... }. See the PR description
# for the canonical key list.)
#
# Region: us-east-1 (same region as the EC2 instance that fetches it).
# The KMS sealing key intentionally stays in us-east-2; that's a
# separate, lower-frequency call path and does not benefit from
# co-locating with this secret.
# --------------------------------------------------------------------

resource "aws_secretsmanager_secret" "api" {
  name                    = "seald-api-${var.environment_slug}"
  description             = "Seald API runtime secrets (DATABASE_URL, Supabase keys, JWT/CRON/METRICS secrets, RESEND_API_KEY). Fetched at container boot by apps/api/scripts/entrypoint.sh."
  recovery_window_in_days = 7

  tags = local.common_tags
}

# Placeholder — real values are written out-of-band via
# `aws secretsmanager put-secret-value` (see header comment). We ship
# an empty JSON object so the secret has a parseable initial version
# and `terraform plan` is stable across re-runs.
resource "aws_secretsmanager_secret_version" "api_placeholder" {
  secret_id     = aws_secretsmanager_secret.api.id
  secret_string = jsonencode({})

  # Operator updates supersede this placeholder. Don't fight them on
  # subsequent applies — Terraform should manage the resource shape,
  # not the secret material.
  lifecycle {
    ignore_changes = [secret_string, version_stages]
  }
}

# Least-privilege policy: GetSecretValue + DescribeSecret on this one
# secret ARN. No wildcards. No write permissions (rotation is a manual
# operator action; if/when we wire automated rotation we can attach a
# separate policy then).
resource "aws_iam_policy" "api_secret_read" {
  name        = "${var.project}-api-secret-read-${var.environment_slug}"
  description = "Allow the Seald API runtime to fetch its Secrets Manager entry (read-only, single ARN)."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadSealdApiSecret"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ]
        Resource = aws_secretsmanager_secret.api.arn
      },
    ]
  })

  tags = local.common_tags
}

# Attach to the API instance role (provisioned by the parallel
# `feat/terraform-api-iam-role` PR as `aws_iam_role.api`). MERGE
# ORDERING: that PR must land + apply before this one, otherwise
# `terraform validate` will flag this reference as undefined. The PR
# description for `feat/aws-secrets-manager` calls this dependency out
# explicitly.
resource "aws_iam_role_policy_attachment" "api_secret_read" {
  role       = aws_iam_role.api.name
  policy_arn = aws_iam_policy.api_secret_read.arn
}
