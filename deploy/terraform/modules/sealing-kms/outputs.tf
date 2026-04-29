output "key_arn" {
  description = "ARN of the PAdES sealing KMS key. Used by the IAM policy and surfaced for operator runbooks."
  value       = aws_kms_key.sealing.arn
}

output "key_id" {
  description = "Bare key id (UUID). This is what `PDF_SIGNING_KMS_KEY_ID` expects in the API env. Prefer the alias for human-facing references."
  value       = aws_kms_key.sealing.key_id
}

output "key_alias" {
  description = "Human-friendly alias (`alias/seald-pades-sealing-<env>`). The API can also accept this in PDF_SIGNING_KMS_KEY_ID."
  value       = aws_kms_alias.sealing.name
}

output "region" {
  description = "Region the key was created in. Mirrors the provider region; surfaced so the operator can copy it directly into PDF_SIGNING_KMS_REGION."
  value       = data.aws_region.current.name
}

output "iam_policy_arn" {
  description = "ARN of the kms:Sign + kms:GetPublicKey policy. Attach to additional roles (e.g. one-off ops, CI cert-rotation jobs) as needed."
  value       = aws_iam_policy.api_kms_sign.arn
}
