#!/usr/bin/env bash
# Sync GitHub Actions environment secrets/vars to Vercel production before deploy.
set -euo pipefail

VERCEL=(npx --yes vercel@54.13.0)

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN is required" >&2
  exit 1
fi

"${VERCEL[@]}" link --project="$VERCEL_PROJECT_ID" --yes --token="$VERCEL_TOKEN"

# A variable with no value is skipped — but says so. Silence here is how the
# Upstash pair went missing on 2026-08-17: the secrets had been saved as two new
# GitHub environments rather than as secrets inside `prod`, and the only symptom
# was three names in this log instead of five.
add_env() {
  local name="$1"
  local value="${!name-}"
  if [ -n "$value" ]; then
    echo "Syncing Vercel env: $name (production)"
    printf '%s' "$value" | "${VERCEL[@]}" env add "$name" production --force --token="$VERCEL_TOKEN"
  else
    echo "::warning::Vercel env $name is not set in this environment — skipping. If it is required, add it as a secret in the GitHub 'prod' environment."
  fi
}

add_env NEXT_PUBLIC_API_URL
add_env GHL_API_TOKEN
add_env GHL_LOCATION_ID
add_env RESEND_API_KEY
add_env REPORT_FROM_EMAIL
add_env UPSTASH_REDIS_REST_URL
add_env UPSTASH_REDIS_REST_TOKEN
add_env DATABASE_URL
add_env DATABASE_URL_UNPOOLED
add_env ALERT_WEBHOOK_URL
add_env ALERT_WEBHOOK_SECRET
