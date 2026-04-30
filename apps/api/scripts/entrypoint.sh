#!/usr/bin/env sh
# Container entrypoint — fetches runtime secrets from AWS Secrets
# Manager (when SEALD_API_SECRET_ID is set), runs migrations, then
# starts the API.
#
# Opt-out via SKIP_MIGRATIONS=1 if you want to run the container without
# touching the DB (e.g. for a horizontally-scaled deploy where one node
# owns migrations and the rest just start).
#
# Secrets-Manager fetch model
# ---------------------------
# When SEALD_API_SECRET_ID is set, we fetch a JSON blob from AWS Secrets
# Manager and export each key as an environment variable — but ONLY
# when the variable is currently unset. That way:
#
#   - prod (set SEALD_API_SECRET_ID, leave sensitive vars unset in
#     env_file): values come from Secrets Manager.
#   - local dev (unset SEALD_API_SECRET_ID, fill apps/api/.env): values
#     come from env_file, fetch is skipped entirely.
#   - hybrid debugging (set both): env_file wins, Secrets Manager fills
#     gaps. Useful when overriding a single key for a hotfix without
#     touching the secret.
#
# The fetch uses the AWS CLI v1 (`apt-get install awscli`) which is
# already present in the runtime image. Auth comes from either
# (a) the EC2 instance role exposed via IMDSv2, or (b) static
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars (legacy path,
# removed once the parallel feat/terraform-api-iam-role lands).
set -eu

fetch_secrets_from_aws() {
  if [ -z "${SEALD_API_SECRET_ID:-}" ]; then
    echo "entrypoint: SEALD_API_SECRET_ID unset — skipping Secrets Manager fetch (using env_file values only)."
    return 0
  fi

  region="${AWS_REGION:-us-east-2}"
  echo "entrypoint: fetching runtime secrets from AWS Secrets Manager (id=$SEALD_API_SECRET_ID region=$region)..."

  if ! command -v aws >/dev/null 2>&1; then
    echo "entrypoint: ERROR — aws CLI not found in image. Rebuild Dockerfile with awscli installed." >&2
    return 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "entrypoint: ERROR — jq not found in image. Rebuild Dockerfile with jq installed." >&2
    return 1
  fi

  # `aws secretsmanager get-secret-value` returns the JSON blob in
  # `SecretString`. Pull it out as raw text, then have jq emit one
  # snippet per key that conditionally assigns + exports it.
  secret_json=$(aws secretsmanager get-secret-value \
    --secret-id "$SEALD_API_SECRET_ID" \
    --region "$region" \
    --query SecretString \
    --output text 2>/dev/null) || {
      echo "entrypoint: ERROR — aws secretsmanager get-secret-value failed (check IAM perms / secret id / region)." >&2
      return 1
    }

  if [ -z "$secret_json" ] || [ "$secret_json" = "null" ]; then
    echo "entrypoint: WARN — Secrets Manager returned an empty blob; nothing to export."
    return 0
  fi

  # Validate it's an object before iterating; if an operator put a
  # raw string in there by mistake, we'd loop over its characters.
  shape=$(printf '%s' "$secret_json" | jq -r 'type' 2>/dev/null || echo "invalid")
  if [ "$shape" != "object" ]; then
    echo "entrypoint: ERROR — Secrets Manager value is not a JSON object (got $shape). Refusing to export." >&2
    return 1
  fi

  # Emit one shell snippet per key that:
  #   1. Skips if the key is already set (env_file / pre-set vars take
  #      precedence — local overrides always win).
  #   2. Otherwise eval-assigns the value (jq's `@sh` filter renders a
  #      POSIX-shell-safe single-quoted literal, pasted directly after
  #      the `=`, NOT inside outer quotes — newlines, spaces, and
  #      embedded single-quotes round-trip cleanly).
  #   3. Exports the variable.
  exports=$(printf '%s' "$secret_json" | jq -r '
    to_entries
    | .[]
    | "if [ -z \"${" + .key + "+x}\" ]; then " + .key + "=" + (.value | tostring | @sh) + "; export " + .key + "; fi"
  ')

  total=$(printf '%s' "$secret_json" | jq -r 'length')
  echo "entrypoint: $total key(s) in Secrets Manager blob (env_file / pre-set vars take precedence)."

  # shellcheck disable=SC2086
  eval "$exports"
}

fetch_secrets_from_aws

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  /app/apps/api/scripts/migrate.sh
else
  echo "entrypoint: SKIP_MIGRATIONS=1, skipping migrate.sh"
fi

exec node /app/apps/api/dist/src/main.js
