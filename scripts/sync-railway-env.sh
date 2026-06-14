#!/usr/bin/env bash
# Sync GitHub Actions environment secrets to Railway before deploy.
set -euo pipefail

RAILWAY_CLI=(npx --yes @railway/cli@5.12.1)

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "RAILWAY_TOKEN is required" >&2
  exit 1
fi

"${RAILWAY_CLI[@]}" link \
  -p "$RAILWAY_PROJECT_ID" \
  -s "$RAILWAY_SERVICE_ID" \
  -e production

set_var() {
  local name="$1"
  local value="${!name-}"
  if [ -n "$value" ]; then
    echo "Syncing Railway variable: $name"
    "${RAILWAY_CLI[@]}" variables set "${name}=${value}" --skip-deploys
  fi
}

set_var OPENROUTER_API_KEY
set_var GIT_TOKEN
set_var NVD_API_KEY
set_var ABUSEIPDB_API_KEY
