# Sealing-KMS module — provisions the asymmetric AWS KMS key that backs
# the production PAdES signer (apps/api/src/sealing/pades-signer.ts ->
# KmsPadesSigner). The private key never leaves KMS; the API process
# only ever calls kms:Sign with a SHA-256 digest of the CMS
# SignedAttributes (RFC 5652 §5.4).
#
# Resources:
#   - aws_kms_key       RSA-3072 SIGN_VERIFY, no rotation (asymmetric
#                       keys cannot be rotated by AWS), 30-day deletion
#                       window so an accidental destroy is recoverable.
#   - aws_kms_alias     Stable handle for the API to reference; the
#                       underlying key id can be rebuilt without touching
#                       env vars.
#   - aws_iam_policy    Least-privilege grant: kms:Sign + kms:GetPublicKey
#                       on this single key arn. Attached to the API role
#                       passed in via var.api_role_name.
#
# What this module deliberately does NOT do:
#   - Generate or sign the X.509 binding certificate (handled by
#     apps/api/scripts/generate-kms-binding-cert.ts after apply).
#   - Configure rotation / re-key (asymmetric SIGN_VERIFY keys are
#     intentionally long-lived; rotation = new key + new cert + env
#     update, see SEALING_KMS_RUNBOOK.md §Rotation).

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
# - customer_master_key_spec = RSA_3072 — matches KmsCmsSigner's
#   RSASSA_PKCS1_V1_5_SHA_256 algorithm (cryptography-expert §8 — the
#   smallest RSA size NIST SP 800-131A still considers acceptable past
#   2030 is 3072).
# - key_usage = SIGN_VERIFY — the only usage the signer ever invokes.
# - enable_key_rotation is omitted: AWS rejects rotation on asymmetric
#   keys, so leaving it unset is the only valid configuration.
# - deletion_window_in_days = 30 — maximum window. PAdES sealed PDFs
#   stay valid only as long as the public key behind the binding cert
#   is reachable for verification, so accidental deletion is the worst
#   class of failure here. 30 days gives plenty of recovery time.
# --------------------------------------------------------------------
resource "aws_kms_key" "sealing" {
  description              = "Seald PAdES sealing key (${var.environment}) — RSA-3072 SIGN_VERIFY, used by KmsPadesSigner"
  customer_master_key_spec = "RSA_3072"
  key_usage                = "SIGN_VERIFY"
  deletion_window_in_days  = 30
  is_enabled               = true

  # Tags require kms:TagResource on the deployer; gated behind a flag so
  # a fresh apply with the minimum-perms CI role succeeds. See variables.tf.
  tags = var.enable_resource_tags ? merge(var.tags, {
    Name        = "seald-pades-sealing-${var.environment}"
    Environment = var.environment
    Purpose     = "pades-signing"
  }) : null
}

resource "aws_kms_alias" "sealing" {
  name          = "alias/seald-pades-sealing-${var.environment}"
  target_key_id = aws_kms_key.sealing.key_id
}

# --------------------------------------------------------------------
# Least-privilege IAM policy.
#
# kms:Sign           — invoked once per sealed PDF.
# kms:GetPublicKey   — invoked by the binding-cert generator script,
#                      and on first boot if the API ever needs to
#                      rebuild the cert from scratch (it doesn't
#                      currently — cert is provisioned offline — but
#                      keeping the permission cheap means the script
#                      doesn't need a separate role).
# kms:DescribeKey    — used by the script for sanity checks (key spec,
#                      key usage). Read-only metadata.
#
# Resource is pinned to the single key arn so the role can't pivot to
# any other KMS key in the account.
# --------------------------------------------------------------------
data "aws_iam_policy_document" "api_kms_sign" {
  statement {
    sid    = "AllowPadesSign"
    effect = "Allow"
    actions = [
      "kms:Sign",
      "kms:GetPublicKey",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.sealing.arn]
  }
}

resource "aws_iam_policy" "api_kms_sign" {
  name        = "seald-pades-sealing-${var.environment}-sign"
  description = "Allow the Seald API role to call kms:Sign + kms:GetPublicKey on the PAdES sealing key (${var.environment})."
  policy      = data.aws_iam_policy_document.api_kms_sign.json

  # Same gating as the KMS key tags above — IAM policies follow the same
  # iam:TagPolicy permission boundary that smaller CI roles often lack.
  tags = var.enable_resource_tags ? merge(var.tags, {
    Environment = var.environment
    Purpose     = "pades-signing"
  }) : null
}

# Attaching the policy is conditional: var.api_role_name = "" means the
# caller hasn't wired up an instance/task role yet (e.g. spot EC2 still
# uses static credentials). In that case we provision the policy + key
# but leave attachment to the operator. Once an IAM role is in place,
# set var.api_role_name and re-apply.
resource "aws_iam_role_policy_attachment" "api_kms_sign" {
  count      = var.api_role_name == "" ? 0 : 1
  role       = var.api_role_name
  policy_arn = aws_iam_policy.api_kms_sign.arn
}
