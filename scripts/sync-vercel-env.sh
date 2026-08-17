#!/usr/bin/env bash
# Sync GitHub Actions environment secrets/vars to Vercel production before deploy.
# NOT `set -e`. One variable that will not sync must not abort the sync of the
# rest — that is what happened on 2026-08-17: ALERT_WEBHOOK_SECRET already
# existed on Vercel in a shape `--force` could not override, the script died at
# that line, and three merged PRs sat undeployed behind a red pipeline. Failures
# are collected and reported at the end instead, so the log shows the state of
# every variable rather than the state of the first broken one.
set -uo pipefail

VERCEL=(npx --yes vercel@54.13.0)

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN is required" >&2
  exit 1
fi

"${VERCEL[@]}" link --project="$VERCEL_PROJECT_ID" --yes --token="$VERCEL_TOKEN"

failed=()

# A variable with no value is skipped — but says so. Silence here is how the
# Upstash pair went missing on 2026-08-17: the secrets had been saved as two new
# GitHub environments rather than as secrets inside `prod`, and the only symptom
# was three names in this log instead of five.
add_env() {
  local name="$1"
  local value="${!name-}"

  if [ -z "$value" ]; then
    echo "::warning::Vercel env $name is not set in this environment — skipping. If it is required, add it as a secret in the GitHub 'prod' environment."
    return 0
  fi

  echo "Syncing Vercel env: $name (production)"
  if printf '%s' "$value" \
    | "${VERCEL[@]}" env add "$name" production --force --token="$VERCEL_TOKEN"; then
    return 0
  fi

  # `--force` overrides a variable scoped to production, but not one that was
  # created against a different target or branch — Vercel rejects those with
  # "already exists for the target production on branch undefined". Automatic
  # integrations create variables in exactly that shape (the same thing put
  # stray STS_SERVICE_TOKEN entries on Vercel earlier today). Remove and re-add
  # rather than leaving production running on a value the pipeline no longer
  # controls.
  echo "  --force was refused; removing the existing $name and re-adding it."
  "${VERCEL[@]}" env rm "$name" production --yes --token="$VERCEL_TOKEN" || true
  if printf '%s' "$value" \
    | "${VERCEL[@]}" env add "$name" production --token="$VERCEL_TOKEN"; then
    echo "  $name re-added."
    return 0
  fi

  echo "::error::Could not sync Vercel env $name. Production is running on whatever value it had before this deploy."
  failed+=("$name")
  return 0
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

# Fail the job if anything could not be synced — but only after every variable
# has been attempted, so one failure does not hide the state of the others.
if [ ${#failed[@]} -gt 0 ]; then
  echo "::error::${#failed[@]} Vercel variable(s) could not be synced: ${failed[*]}"
  exit 1
fi
