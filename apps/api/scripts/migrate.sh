#!/usr/bin/env sh
# Seald — apply pending SQL migrations before the API starts.
#
# Idempotent: uses a `schema_migrations` table to track applied filenames
# and skips any already-applied migration. Safe to run on every container
# boot; first-boot runs the full set, subsequent boots are a no-op.
#
# Expects DATABASE_URL in the env. Uses psql (installed via apt in the
# runtime image). Files are ordered lexicographically — our convention
# is the 4-digit prefix (0001_, 0002_, …).

set -eu

: "${DATABASE_URL:?DATABASE_URL is required to run migrations}"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/apps/api/db/migrations}"
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "migrate: migrations directory $MIGRATIONS_DIR not found" >&2
  exit 1
fi

echo "migrate: ensuring schema_migrations ledger exists"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
create table if not exists public.schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
);
SQL

# List applied filenames once so we don't round-trip per file.
APPLIED=$(psql "$DATABASE_URL" -At -c "select filename from public.schema_migrations")

for file in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  name=$(basename "$file")
  if echo "$APPLIED" | grep -Fxq "$name"; then
    echo "migrate: skip $name (already applied)"
    continue
  fi
  echo "migrate: apply $name"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    -c "insert into public.schema_migrations (filename) values ('$name')"
done

echo "migrate: done"
