#!/usr/bin/env bash
# Capture dashboard demo screenshots from static HTML mockups.
# Requires Google Chrome or Chromium in PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGES="$ROOT/docs/screenshots/demo-pages"
OUT="$ROOT/docs/screenshots"

chrome=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "google-chrome" \
  "chromium" \
  "chromium-browser"
do
  if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then
    chrome="$candidate"
    break
  fi
done

if [[ -z "$chrome" ]]; then
  echo "Chrome/Chromium not found. Open HTML files in docs/screenshots/demo-pages/ manually." >&2
  exit 1
fi

mkdir -p "$OUT"

capture() {
  local html="$1"
  local png="$2"
  "$chrome" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --window-size=1280,900 \
    --screenshot="$png" \
    "file://$html"
  echo "Wrote $png"
}

capture "$PAGES/01-scan-input.html" "$OUT/01-scan-input.png"
capture "$PAGES/02-live-agents.html" "$OUT/02-live-agents.png"
capture "$PAGES/03-rag-output.html" "$OUT/03-rag-output.png"
capture "$PAGES/04-eval-metrics.html" "$OUT/04-eval-metrics.png"
