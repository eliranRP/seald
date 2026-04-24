#!/usr/bin/env sh
# Container entrypoint — runs migrations, then starts the API.
#
# Opt-out via SKIP_MIGRATIONS=1 if you want to run the container without
# touching the DB (e.g. for a horizontally-scaled deploy where one node
# owns migrations and the rest just start).
set -eu

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  /app/apps/api/scripts/migrate.sh
else
  echo "entrypoint: SKIP_MIGRATIONS=1, skipping migrate.sh"
fi

exec node /app/apps/api/dist/src/main.js
