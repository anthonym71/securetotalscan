#!/usr/bin/env bash
# Install Trivy CLI (https://github.com/aquasecurity/trivy) for Docker CVE scanning.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_INSTALL="${SCRIPT_DIR}/../.bin"
INSTALL_DIR="${TRIVY_INSTALL_DIR:-$DEFAULT_INSTALL}"
VERSION="${TRIVY_VERSION:-0.71.0}"

if command -v trivy >/dev/null 2>&1; then
  echo "Trivy already installed: $(trivy --version | head -1)"
  exit 0
fi

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Linux) OS_TAG="Linux" ;;
  Darwin) OS_TAG="macOS" ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 1
    ;;
esac
case "$ARCH" in
  x86_64) ARCH_TAG="64bit" ;;
  aarch64|arm64) ARCH_TAG="ARM64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

TARBALL="trivy_${VERSION}_${OS_TAG}-${ARCH_TAG}.tar.gz"
URL="https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/${TARBALL}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading Trivy v${VERSION} from ${URL}..."
curl -fsSL "$URL" -o "${TMP}/trivy.tar.gz"
tar -xzf "${TMP}/trivy.tar.gz" -C "$TMP" trivy

mkdir -p "$INSTALL_DIR"
install -m 0755 "${TMP}/trivy" "${INSTALL_DIR}/trivy"

export PATH="${INSTALL_DIR}:${PATH}"
trivy --version | head -1
echo "Installed to ${INSTALL_DIR}/trivy"
echo "Set in backend/.env: TRIVY_PATH=${INSTALL_DIR}/trivy"
echo "Downloading Trivy vulnerability DB (first-time setup)..."
DB_ARGS=()
if [ -n "${TRIVY_CACHE_DIR:-}" ]; then
  mkdir -p "$TRIVY_CACHE_DIR"
  DB_ARGS=(--cache-dir "$TRIVY_CACHE_DIR")
fi
trivy image --download-db-only "${DB_ARGS[@]}"

echo "Trivy ready."
