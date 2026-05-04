output "key_arn" {
  description = "ARN of the Google Drive token wrapping KMS key. Maps directly into env var GDRIVE_TOKEN_KMS_KEY_ARN."
  value       = aws_kms_key.gdrive_token.arn
}

output "key_id" {
  description = "Bare key id (UUID). Surfaced for diagnostics; the API consumes the ARN form via GDRIVE_TOKEN_KMS_KEY_ARN."
  value       = aws_kms_key.gdrive_token.key_id
}

output "key_alias" {
  description = "Human-friendly alias (`alias/seald-gdrive-token-<env>`). Use this in runbooks and the AWS console."
  value       = aws_kms_alias.gdrive_token.name
}

output "region" {
  description = "Region the key was created in. Mirrors the provider region; surfaced so the operator can copy it directly into GDRIVE_TOKEN_KMS_REGION."
  value       = data.aws_region.current.name
}

output "iam_policy_arn" {
  description = "ARN of the kms:GenerateDataKey + kms:Decrypt policy. Attach to additional roles (e.g. one-off ops) as needed."
  value       = aws_iam_policy.api_gdrive_token.arn
}
