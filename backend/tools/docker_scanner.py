"""Docker Hub image scanner — metadata analysis and Trivy CVE scanning."""

import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import httpx

DOCKER_HUB_API = "https://hub.docker.com/v2"
STALE_DAYS = 365
TRIVY_SEVERITIES = os.getenv("TRIVY_SEVERITIES", "CRITICAL,HIGH,MEDIUM")
TRIVY_MAX_CVES = int(os.getenv("TRIVY_MAX_CVES", "25"))
TRIVY_TIMEOUT_SEC = int(os.getenv("TRIVY_TIMEOUT_SEC", "180"))


@dataclass
class TrivyScanResult:
    """Outcome of a Trivy image scan."""

    findings: list[dict]
    ran: bool
    available: bool
    cve_count: int
    error: str


def resolve_trivy_binary() -> str | None:
    """Return the Trivy executable path from ``TRIVY_PATH`` or common install locations."""
    candidates: list[str] = []
    configured = (os.getenv("TRIVY_PATH") or "").strip()
    if configured:
        candidates.append(str(Path(configured).expanduser()))
    candidates.append(str(Path(__file__).resolve().parent.parent / ".bin" / "trivy"))
    candidates.append("/usr/local/bin/trivy")
    which = shutil.which("trivy")
    if which:
        candidates.append(which)

    seen: set[str] = set()
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        if Path(path).is_file() and os.access(path, os.X_OK):
            return path
    return None


def ensure_trivy_db() -> str | None:
    """Download the Trivy vulnerability DB if missing. Returns error text or None."""
    binary = resolve_trivy_binary()
    if not binary:
        return "Trivy binary not found"
    if os.getenv("TRIVY_SKIP_DB_UPDATE", "").lower() in ("1", "true", "yes"):
        return None
    try:
        proc = subprocess.run(
            [binary, "image", "--download-db-only", "--quiet"],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            return err or f"Trivy DB download failed (exit {proc.returncode})"
    except (subprocess.TimeoutExpired, OSError) as e:
        return str(e)
    return None


def _severity_rank(severity: str) -> int:
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4}
    return order.get(severity.upper(), 5)


def _parse_trivy_json(payload: dict, image_ref: str, max_items: int) -> tuple[list[dict], int]:
    """Parse Trivy JSON report into finding dicts and total CVE count."""
    vulns: list[dict] = []
    for result in payload.get("Results") or []:
        for vuln in result.get("Vulnerabilities") or []:
            vulns.append(vuln)

    vulns.sort(key=lambda v: _severity_rank(v.get("Severity", "UNKNOWN")))
    total = len(vulns)

    findings: list[dict] = []
    for vuln in vulns[:max_items]:
        severity = vuln.get("Severity", "UNKNOWN").upper()
        if severity not in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
            severity = "MEDIUM"
        vid = vuln.get("VulnerabilityID", "Unknown CVE")
        pkg = vuln.get("PkgName", "package")
        fixed = vuln.get("FixedVersion") or "a patched version"
        title = vuln.get("Title") or vuln.get("Description", "")[:200]
        findings.append(
            {
                "source": "trivy",
                "category": "CVE",
                "name": vid,
                "severity": severity,
                "description": title,
                "package": pkg,
                "installed_version": vuln.get("InstalledVersion", ""),
                "fixed_version": vuln.get("FixedVersion", ""),
                "recommendation": f"Upgrade {pkg} to {fixed}",
                "fix_prompt": (
                    f"Fix {vid} in Docker image {image_ref}: upgrade {pkg} "
                    f"from {vuln.get('InstalledVersion', '?')} to {fixed} "
                    f"and rebuild the image with a pinned base tag."
                ),
            }
        )
    return findings, total


def run_trivy_scan(image_ref: str) -> TrivyScanResult:
    """Run Trivy CVE scan against a container image reference."""
    binary = resolve_trivy_binary()
    if not binary:
        return TrivyScanResult([], False, False, 0, "Trivy not installed")

    db_error = ensure_trivy_db()
    if db_error:
        return TrivyScanResult([], False, True, 0, db_error)

    cmd = [
        binary,
        "image",
        "--scanners",
        "vuln",
        "--severity",
        TRIVY_SEVERITIES,
        "--format",
        "json",
        "--quiet",
        image_ref,
    ]
    cache_dir = (os.getenv("TRIVY_CACHE_DIR") or "").strip()
    if cache_dir:
        cmd.extend(["--cache-dir", cache_dir])

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TRIVY_TIMEOUT_SEC,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return TrivyScanResult(
            [], True, True, 0, f"Trivy timed out after {TRIVY_TIMEOUT_SEC}s"
        )
    except OSError as e:
        return TrivyScanResult([], False, True, 0, str(e))

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()

    # Trivy exits 1 when vulnerabilities are found — that is success for us.
    if not stdout:
        err = stderr or f"Trivy produced no output (exit {proc.returncode})"
        return TrivyScanResult([], True, True, 0, err)

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as e:
        return TrivyScanResult([], True, True, 0, f"Invalid Trivy JSON: {e}")

    findings, total = _parse_trivy_json(payload, image_ref, TRIVY_MAX_CVES)
    return TrivyScanResult(findings, True, True, total, "")


def parse_docker_image_ref(raw: str) -> tuple[str, str, str]:
    """Parse a Docker Hub reference into namespace, repo, and tag."""
    text = raw.strip()
    if not text:
        raise ValueError("Docker image URL or name is required")

    if "hub.docker.com" in text:
        path = urlparse(text).path.strip("/")
        if path.startswith("r/"):
            parts = path[2:].split("/")
            if len(parts) < 2:
                raise ValueError("Invalid Docker Hub repository URL")
            namespace, repo = parts[0], parts[1]
            tag = "latest"
            if len(parts) >= 4 and parts[2] == "tags":
                tag = parts[3]
            return namespace, repo, tag
        if path.startswith("_/"):
            return "library", path[2:], "latest"

    text = re.sub(r"^https?://", "", text)
    text = re.sub(r"^docker\.io/", "", text)
    text = re.sub(r"^registry-1\.docker\.io/", "", text)

    tag = "latest"
    if "@" in text:
        text = text.split("@")[0]
    if ":" in text:
        text, tag = text.rsplit(":", 1)

    if "/" in text:
        namespace, repo = text.split("/", 1)
    else:
        namespace, repo = "library", text

    if not repo:
        raise ValueError("Invalid Docker image reference")

    return namespace, repo, tag


def docker_registry_ref(namespace: str, repo: str, tag: str) -> str:
    """Build the registry reference Trivy expects."""
    return f"docker.io/{namespace}/{repo}:{tag}"


def _fetch_repo(namespace: str, repo: str) -> dict:
    url = f"{DOCKER_HUB_API}/repositories/{namespace}/{repo}/"
    resp = httpx.get(url, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _fetch_tag(namespace: str, repo: str, tag: str) -> dict | None:
    url = f"{DOCKER_HUB_API}/repositories/{namespace}/{repo}/tags/{tag}/"
    resp = httpx.get(url, timeout=15)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def _days_since(iso_date: str) -> int | None:
    if not iso_date:
        return None
    try:
        dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).days
    except ValueError:
        return None


def scan_docker_image(image_input: str) -> dict:
    """Scan a Docker Hub image for security issues."""
    namespace, repo, tag = parse_docker_image_ref(image_input)
    image_ref = f"{namespace}/{repo}:{tag}" if namespace != "library" else f"{repo}:{tag}"
    registry_ref = docker_registry_ref(namespace, repo, tag)

    findings: list[dict] = []
    scan_error = ""
    trivy_available = resolve_trivy_binary() is not None
    trivy_ran = False
    trivy_cve_count = 0
    trivy_error = ""

    try:
        repo_meta = _fetch_repo(namespace, repo)
    except httpx.HTTPStatusError as e:
        return {
            "image_ref": image_ref,
            "namespace": namespace,
            "repo": repo,
            "tag": tag,
            "findings": [],
            "scan_error": f"Docker Hub repository not found: {namespace}/{repo} ({e.response.status_code})",
            "trivy_available": trivy_available,
            "trivy_ran": False,
            "trivy_cve_count": 0,
            "trivy_error": "",
        }
    except Exception as e:
        return {
            "image_ref": image_ref,
            "namespace": namespace,
            "repo": repo,
            "tag": tag,
            "findings": [],
            "scan_error": f"Failed to fetch Docker Hub metadata: {e}",
            "trivy_available": trivy_available,
            "trivy_ran": False,
            "trivy_cve_count": 0,
            "trivy_error": "",
        }

    tag_meta = _fetch_tag(namespace, repo, tag)
    is_official = repo_meta.get("is_official", namespace == "library")
    pull_count = repo_meta.get("pull_count", 0)
    last_updated = repo_meta.get("last_updated") or (tag_meta or {}).get("last_updated", "")
    days_old = _days_since(last_updated)

    if tag == "latest":
        findings.append(
            {
                "source": "docker_hub",
                "category": "CIS-Docker",
                "name": "Using :latest tag",
                "severity": "HIGH",
                "description": f"Image {image_ref} uses the mutable :latest tag",
                "recommendation": "Pin to a specific version tag or immutable digest in production",
                "fix_prompt": (
                    f"Replace {image_ref} with a pinned version tag or digest in your "
                    f"docker-compose.yml / Kubernetes manifest. Example: {repo}:<version>@sha256:<digest>"
                ),
            }
        )

    if days_old is not None and days_old > STALE_DAYS:
        findings.append(
            {
                "source": "docker_hub",
                "category": "CIS-Docker",
                "name": "Stale container image",
                "severity": "MEDIUM",
                "description": f"Image last updated {days_old} days ago",
                "recommendation": "Rebuild on a current base image and apply security patches",
                "fix_prompt": (
                    f"Rebuild {image_ref} from an updated base image. The current image "
                    f"has not been updated in over {STALE_DAYS} days."
                ),
            }
        )

    if not is_official and pull_count < 1000:
        findings.append(
            {
                "source": "docker_hub",
                "category": "Supply-Chain",
                "name": "Low-trust community image",
                "severity": "MEDIUM",
                "description": f"Non-official image with {pull_count} pulls",
                "recommendation": "Prefer official or verified publisher images; scan before use",
                "fix_prompt": (
                    f"Review trustworthiness of {namespace}/{repo}. Prefer official images "
                    f"or build from source. Scan with Trivy before deploying."
                ),
            }
        )

    if tag_meta is None:
        findings.append(
            {
                "source": "docker_hub",
                "category": "CIS-Docker",
                "name": "Tag not found",
                "severity": "HIGH",
                "description": f"Tag '{tag}' does not exist for {namespace}/{repo}",
                "recommendation": "Verify the tag name on Docker Hub",
                "fix_prompt": f"Check available tags at https://hub.docker.com/r/{namespace}/{repo}/tags",
            }
        )

    trivy = run_trivy_scan(registry_ref)
    trivy_ran = trivy.ran
    trivy_cve_count = trivy.cve_count
    trivy_error = trivy.error
    trivy_available = trivy.available
    findings.extend(trivy.findings)

    if trivy_ran and trivy_cve_count > len(trivy.findings):
        findings.append(
            {
                "source": "trivy",
                "category": "CVE",
                "name": f"+{trivy_cve_count - len(trivy.findings)} additional CVEs",
                "severity": "INFO",
                "description": (
                    f"Trivy reported {trivy_cve_count} total CVEs; "
                    f"showing top {len(trivy.findings)} by severity"
                ),
                "recommendation": "Review full Trivy report in CI or run trivy locally",
                "fix_prompt": f"Run: trivy image {registry_ref}",
            }
        )

    return {
        "image_ref": image_ref,
        "namespace": namespace,
        "repo": repo,
        "tag": tag,
        "is_official": is_official,
        "pull_count": pull_count,
        "last_updated": last_updated,
        "findings": findings,
        "scan_error": scan_error,
        "trivy_available": trivy_available,
        "trivy_ran": trivy_ran,
        "trivy_cve_count": trivy_cve_count,
        "trivy_error": trivy_error,
    }


def scan_docker_image_safe(image_input: str) -> dict:
    """Like :func:`scan_docker_image` but never raises."""
    try:
        return scan_docker_image(image_input)
    except ValueError as e:
        return {
            "image_ref": image_input,
            "namespace": "",
            "repo": "",
            "tag": "",
            "findings": [],
            "scan_error": str(e),
            "trivy_available": resolve_trivy_binary() is not None,
            "trivy_ran": False,
            "trivy_cve_count": 0,
            "trivy_error": "",
        }
    except Exception as e:
        return {
            "image_ref": image_input,
            "namespace": "",
            "repo": "",
            "tag": "",
            "findings": [],
            "scan_error": f"Docker scan failed: {e}",
            "trivy_available": resolve_trivy_binary() is not None,
            "trivy_ran": False,
            "trivy_cve_count": 0,
            "trivy_error": "",
        }
