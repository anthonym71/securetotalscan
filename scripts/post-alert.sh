#!/usr/bin/env bash
# Post one HMAC-signed alert to the on-call endpoint.
#
# The shell implementation of the same contract as lib/alerting.ts and
# backend/alerting.py — see docs/ALERTING.md for the wire format. This one is
# used by the scheduled health check, which must be able to alert when both
# Vercel and Railway are down, and therefore cannot live inside either.
#
# Usage:
#   post-alert.sh --severity critical --kind backend-down \
#                 --dedupe-key backend-down [--site host] [--detail "one line"]
#
# Silent no-op when ALERT_WEBHOOK_URL / ALERT_WEBHOOK_SECRET are unset, so a
# fork or a local run never tries to page anyone.
set -uo pipefail

severity=""
kind=""
site=""
detail=""
dedupe_key=""

while [ $# -gt 0 ]; do
  case "$1" in
    --severity)   severity="$2"; shift 2 ;;
    --kind)       kind="$2"; shift 2 ;;
    --site)       site="$2"; shift 2 ;;
    --detail)     detail="$2"; shift 2 ;;
    --dedupe-key) dedupe_key="$2"; shift 2 ;;
    *) echo "post-alert.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done

if [ -z "$severity" ] || [ -z "$kind" ]; then
  echo "post-alert.sh: --severity and --kind are required" >&2
  exit 2
fi
: "${dedupe_key:=$kind}"

if [ -z "${ALERT_WEBHOOK_URL:-}" ] || [ -z "${ALERT_WEBHOOK_SECRET:-}" ]; then
  echo "::warning::Alerting is not configured (ALERT_WEBHOOK_URL / ALERT_WEBHOOK_SECRET) — would have sent ${severity}/${kind}."
  exit 0
fi

# Truncate detail to the same 500-char bound the other two implementations use,
# and collapse whitespace so the payload stays one line.
detail="$(printf '%s' "$detail" | tr '\n\r\t' '   ' | cut -c1-500)"

json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])'
}

occurred_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
timestamp="$(date -u +%s)"

body="$(printf '{"severity":"%s","kind":"%s","site":"%s","customer":"","detail":"%s","occurred_at":"%s","dedupe_key":"%s","source":"health-check"}' \
  "$(json_escape "$severity")" \
  "$(json_escape "$kind")" \
  "$(json_escape "$site")" \
  "$(json_escape "$detail")" \
  "$occurred_at" \
  "$(json_escape "$dedupe_key")")"

signature="sha256=$(printf '%s' "$body" \
  | openssl dgst -sha256 -hmac "$ALERT_WEBHOOK_SECRET" \
  | sed 's/^.* //')"

# Failure to alert must not fail the job that is reporting a problem — but it
# must be visible, or a broken alert path looks exactly like a healthy system.
if curl -fsS --max-time 5 \
  -X POST "$ALERT_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-sts-signature: ${signature}" \
  -H "x-sts-timestamp: ${timestamp}" \
  --data-binary "$body" >/dev/null; then
  echo "Alert sent: ${severity}/${kind}"
else
  echo "::error::Alert POST failed for ${severity}/${kind} — the alert path itself is broken."
fi
