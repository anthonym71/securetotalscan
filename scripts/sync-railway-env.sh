#!/usr/bin/env bash
# Sync GitHub Actions environment secrets to Railway, then deploy and verify.
# Uses a Railway *project token* (RAILWAY_TOKEN) — do not use railway link.
#
# Deploys wait for their result. An earlier version used `railway up --detach`,
# which returns the moment the upload completes and never learns whether the
# build, deploy or healthcheck succeeded. CD reported success on every run for
# two months while production was down. See docs/CHANGELOG-BUILD.md, 2026-08-17.
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

# A variable with no value is skipped — but says so. Silence here is how the
# Upstash pair went missing on 2026-08-17: the secrets had been saved in the
# wrong place, and the only symptom was a shorter list in the log.
set_var() {
  local name="$1"
  local value="${!name-}"
  if [ -n "$value" ]; then
    echo "Syncing Railway variable: $name"
    "${RAILWAY_CLI[@]}" variable set "${name}=${value}" "${railway_target[@]}" --skip-deploys
  else
    echo "::warning::Railway variable $name is not set in this environment — skipping. If it is required, add it as a secret in the GitHub 'prod' environment."
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
  # No --detach: wait for the build so a failure fails this job. Wrapped in a
  # timeout so a hung build cannot occupy the runner indefinitely.
  timeout "${RAILWAY_UP_TIMEOUT_SEC:-900}" "${RAILWAY_CLI[@]}" up "${railway_target[@]}"
}

# Confirm the deployed service actually answers, and answers correctly.
#
# /health/trivy returns HTTP 200 even when Trivy is missing — the failure is in
# the body (`"available": false`), not the status code. Railway's own
# healthcheck therefore passes on a broken scanner, so status alone proves
# nothing and the payload has to be read.
verify_deploy() {
  local base="${BACKEND_HEALTH_URL:-${NEXT_PUBLIC_API_URL:-}}"
  if [ -z "$base" ]; then
    echo "::warning::Neither BACKEND_HEALTH_URL nor NEXT_PUBLIC_API_URL is set — skipping post-deploy verification."
    return 0
  fi

  local url="${base%/}/health/trivy"
  local attempts="${HEALTH_ATTEMPTS:-20}"
  local delay="${HEALTH_DELAY_SEC:-15}"
  local body=""

  echo "Verifying backend health at ${url}"
  for i in $(seq 1 "$attempts"); do
    if body="$(curl -fsS --max-time 20 "$url" 2>/dev/null)"; then
      case "$body" in
        *'"available":true'*|*'"available": true'*)
          echo "Backend healthy: $body"
          case "$body" in
            *'"db_ready":false'*|*'"db_ready": false'*)
              echo "::warning::Trivy CVE database is not ready — Docker image scanning will be degraded until it downloads."
              ;;
          esac
          return 0
          ;;
        *)
          echo "  attempt ${i}/${attempts}: reachable but not healthy — ${body}"
          ;;
      esac
    else
      echo "  attempt ${i}/${attempts}: no response yet"
    fi
    sleep "$delay"
  done

  echo "::error::Backend did not become healthy at ${url} after $((attempts * delay))s. Last response: ${body:-<none>}"
  return 1
}

case "${1:-}" in
  --deploy)
    deploy_railway
    verify_deploy
    ;;
  --verify)
    verify_deploy
    ;;
esac
