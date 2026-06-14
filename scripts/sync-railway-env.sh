#!/usr/bin/env bash
# Sync GitHub Actions environment secrets to Railway before deploy.
# Uses a Railway *project token* (RAILWAY_TOKEN) — do not use railway link.
set -euo pipefail

RAILWAY_CLI=(npx --yes @railway/cli@5.12.1)

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "RAILWAY_TOKEN is required (Railway project token for the production environment)" >&2
  exit 1
fi

if [ -z "${RAILWAY_PROJECT_ID:-}" ] || [ -z "${RAILWAY_SERVICE_ID:-}" ]; then
  echo "RAILWAY_PROJECT_ID and RAILWAY_SERVICE_ID are required" >&2
  exit 1
fi

export RAILWAY_TOKEN

railway_target=(
  -p "$RAILWAY_PROJECT_ID"
  -s "$RAILWAY_SERVICE_ID"
  -e production
)

set_var() {
  local name="$1"
  local value="${!name-}"
  if [ -n "$value" ]; then
    echo "Syncing Railway variable: $name"
    "${RAILWAY_CLI[@]}" variable set "${name}=${value}" "${railway_target[@]}" --skip-deploys
  fi
}

set_var OPENROUTER_API_KEY
set_var GIT_TOKEN
# Legacy Railway env name (pre-rename); keep in sync when GIT_TOKEN is set
if [ -n "${GIT_TOKEN:-}" ]; then
  echo "Syncing Railway variable: GITHUB_TOKEN (legacy alias)"
  "${RAILWAY_CLI[@]}" variable set "GITHUB_TOKEN=${GIT_TOKEN}" "${railway_target[@]}" --skip-deploys
fi
set_var NVD_API_KEY
set_var ABUSEIPDB_API_KEY

deploy_railway() {
  echo "Deploying backend to Railway (project=${RAILWAY_PROJECT_ID}, service=${RAILWAY_SERVICE_ID})"
  "${RAILWAY_CLI[@]}" up --detach "${railway_target[@]}"
}

case "${1:-}" in
  --deploy)
    deploy_railway
    ;;
esac
