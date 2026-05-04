# gdrive-token-kms module — provisions the symmetric AWS KMS CMK that
# wraps per-row Data Encryption Keys (DEKs) used to encrypt Google Drive
# OAuth refresh tokens at rest.
#
# Why this exists separately from sealing-kms:
#   The PAdES sealing key is RSA-3072 SIGN_VERIFY (kms:Sign only). Drive
#   token encryption needs envelope encryption (kms:GenerateDataKey →
#   plaintext DEK encrypts the row, ciphertext DEK persisted alongside),
#   which AWS only supports on SYMMETRIC_DEFAULT ENCRYPT_DECRYPT keys.
#   The two key specs are mutually exclusive — hence two CMKs.
#
# Resources:
#   - aws_kms_key       SYMMETRIC_DEFAULT ENCRYPT_DECRYPT, rotation ON
#                       (annual, AWS-managed for symmetric keys), 30-day
#                       deletion window so accidental destroy is recoverable.
#   - aws_kms_alias     Stable handle (`alias/seald-gdrive-token-<env>`)
#                       so the API can reference the key without baking
#                       the underlying key id into the env file.
#   - aws_iam_policy    Least-privilege grant: kms:GenerateDataKey +
#                       kms:Decrypt + kms:DescribeKey on this key only.
#                       Attached to the API role passed via var.api_role_name.
#
# Consumed by apps/api/src/integrations/gdrive/gdrive-kms.service.ts
# (DriveKmsService.fromEnv) which reads the two output values via env:
#   - GDRIVE_TOKEN_KMS_KEY_ARN  ← module.gdrive_token_kms.key_arn
#   - GDRIVE_TOKEN_KMS_REGION   ← module.gdrive_token_kms.region

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# --------------------------------------------------------------------
# The KMS key itself.
#
# - customer_master_key_spec = SYMMETRIC_DEFAULT — required for
#   GenerateDataKey / Decrypt envelope-encryption pattern.
# - key_usage = ENCRYPT_DECRYPT — paired with the spec above.
# - enable_key_rotation = true — AWS supports automatic annual rotation
#   for symmetric CMKs at zero cost. Past ciphertexts remain decryptable
#   (KMS keeps prior key material) so rotation is transparent to the API.
# - deletion_window_in_days = 30 — losing the key means every persisted
#   refresh token is unrecoverable and every connected user must
#   re-consent. Maximum window gives plenty of recovery time.
# --------------------------------------------------------------------
resource "aws_kms_key" "gdrive_token" {
  description              = "Seald Google Drive OAuth token wrapping key (${var.environment}) — symmetric ENCRYPT_DECRYPT, used by DriveKmsService"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage                = "ENCRYPT_DECRYPT"
  enable_key_rotation      = true
  deletion_window_in_days  = 30
  is_enabled               = true

  # Tag application is gated behind enable_resource_tags so a fresh apply
  # with a minimum-perms CI role (no kms:TagResource) succeeds. Mirrors
  # the sealing-kms convention.
  tags = var.enable_resource_tags ? merge(var.tags, {
    Name        = "seald-gdrive-token-${var.environment}"
    Environment = var.environment
    Purpose     = "gdrive-token-encryption"
  }) : null
}

resource "aws_kms_alias" "gdrive_token" {
  name          = "alias/seald-gdrive-token-${var.environment}"
  target_key_id = aws_kms_key.gdrive_token.key_id
}

# --------------------------------------------------------------------
# Least-privilege IAM policy.
#
# kms:GenerateDataKey  — invoked once per refresh-token write to mint a
#                        per-row 256-bit DEK + its ciphertext.
# kms:Decrypt          — invoked once per refresh-token read to unwrap
#                        the row's stored ciphertext DEK.
# kms:DescribeKey      — used by DriveKmsService.fromEnv on boot for a
#                        sanity check (key spec + key usage). Read-only.
#
# Resource pinned to the single key arn so the role cannot pivot to any
# other KMS key in the account.
# --------------------------------------------------------------------
data "aws_iam_policy_document" "api_gdrive_token" {
  statement {
    sid    = "AllowGdriveTokenWrap"
    effect = "Allow"
    actions = [
      "kms:GenerateDataKey",
      "kms:Decrypt",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.gdrive_token.arn]
  }
}

resource "aws_iam_policy" "api_gdrive_token" {
  name        = "seald-gdrive-token-${var.environment}-wrap"
  description = "Allow the Seald API role to call kms:GenerateDataKey + kms:Decrypt on the Drive token wrapping key (${var.environment})."
  policy      = data.aws_iam_policy_document.api_gdrive_token.json

  tags = var.enable_resource_tags ? merge(var.tags, {
    Environment = var.environment
    Purpose     = "gdrive-token-encryption"
  }) : null
}

# Attach conditionally — empty api_role_name means caller hasn't wired
# an instance/task role yet; provision the policy + key but leave the
# attachment to the operator. Mirrors sealing-kms.
resource "aws_iam_role_policy_attachment" "api_gdrive_token" {
  count      = var.api_role_name == "" ? 0 : 1
  role       = var.api_role_name
  policy_arn = aws_iam_policy.api_gdrive_token.arn
}
