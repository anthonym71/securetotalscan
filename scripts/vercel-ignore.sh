#!/usr/bin/env bash
# Vercel Ignored Build Step (see vercel.json). Exit 0 = skip, exit 1 = build.
set -euo pipefail

if [ -n "${VERCEL_GIT_PULL_REQUEST_ID:-}" ]; then
  exit 0
fi

if [ "${VERCEL_ENV:-}" != "production" ]; then
  exit 0
fi

changed="$(git diff --name-only HEAD^ HEAD 2>/dev/null || true)"
if echo "$changed" | grep -qE '^(app/|components/|lib/|public/|package\.json|package-lock\.json|next\.config|tailwind\.config|postcss\.config|tsconfig|middleware\.|eslint\.config)'; then
  exit 1
fi

exit 0
