#!/usr/bin/env bash
# Sync GitHub Actions environment secrets/vars to Vercel production before deploy.
set -euo pipefail

VERCEL=(npx --yes vercel@54.13.0)

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN is required" >&2
  exit 1
fi

"${VERCEL[@]}" link --project="$VERCEL_PROJECT_ID" --yes --token="$VERCEL_TOKEN"

add_env() {
  local name="$1"
  local value="${!name-}"
  if [ -n "$value" ]; then
    echo "Syncing Vercel env: $name (production)"
    printf '%s' "$value" | "${VERCEL[@]}" env add "$name" production --force --token="$VERCEL_TOKEN"
  fi
}

add_env NEXT_PUBLIC_API_URL
add_env GHL_API_TOKEN
add_env GHL_LOCATION_ID
add_env RESEND_API_KEY
add_env REPORT_FROM_EMAIL
add_env UPSTASH_REDIS_REST_URL
add_env UPSTASH_REDIS_REST_TOKEN
