"""Vuln Scanner agent — OWASP mapping, HTTP headers, and GitHub code analysis."""

from tools.github_scanner import scan_github_repo_safe
from state import SecurityState

OWASP_MAP = {
    "path_traversal": {
        "category": "OWASP-A01",
        "name": "Broken Access Control",
        "severity": "HIGH",
        "recommendation": (
            "Validate and sanitize file paths; deny access to sensitive directories"
        ),
    },
    "sudo_failure": {
        "category": "OWASP-A07",
        "name": "Identification and Authentication Failures",
        "severity": "HIGH",
        "recommendation": (
            "Review sudo policies and enforce least-privilege for service accounts"
        ),
    },
    "brute_force": {
        "category": "OWASP-A07",
        "name": "Identification and Authentication Failures",
        "severity": "CRITICAL",
        "recommendation": (
            "Block attacking IPs, enable account lockout, and enforce MFA for SSH"
        ),
    },
    "port_scan": {
        "category": "OWASP-A05",
        "name": "Security Misconfiguration",
        "severity": "MEDIUM",
        "recommendation": (
            "Harden network perimeter and monitor for reconnaissance traffic"
        ),
    },
}

REQUIRED_HEADERS = [
    "X-Frame-Options",
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "Strict-Transport-Security",
]


def scan_for_owasp(anomalies: list[dict]) -> list[dict]:
    """Map anomaly types to OWASP categories (one entry per category).

    Args:
        anomalies: Detected log anomalies.

    Returns:
        List of vulnerability dicts linked to anomaly types.
    """
    seen = set()
    vulns = []
    for a in anomalies:
        mapping = OWASP_MAP.get(a["type"])
        if mapping and mapping["category"] not in seen:
            seen.add(mapping["category"])
            vulns.append({**mapping, "linked_anomaly": a["type"]})
    return vulns


def check_api_headers(headers: dict) -> list[dict]:
    """Flag missing recommended HTTP security response headers.

    Args:
        headers: Response header name → value mapping to inspect.

    Returns:
        List of missing-header findings with remediation text.
    """
    missing = []
    for h in REQUIRED_HEADERS:
        if h not in headers:
            missing.append(
                {
                    "header": h,
                    "severity": "MEDIUM",
                    "recommendation": f"Add {h} response header",
                }
            )
    return missing


def scan_github_code(state: SecurityState) -> dict:
    """Run GitHub static analysis when ``github_repo`` is set in state.

    Args:
        state: Pipeline state; uses ``github_repo`` field.

    Returns:
        Scan result dict with languages, findings, and optional ``scan_error``.
    """
    repo = state.get("github_repo", "")
    if not repo:
        return {
            "github_repo": "",
            "repo_languages": {},
            "primary_language": "",
            "files_scanned": 0,
            "code_findings": [],
        }
    result = scan_github_repo_safe(repo)
    if "error" in result:
        return {
            "github_repo": repo,
            "repo_languages": {},
            "primary_language": "",
            "files_scanned": 0,
            "code_findings": [],
            "scan_error": result["error"],
        }
    return result


def _compute_risk_level(vulns: list[dict]) -> str:
    """Derive overall risk level from the highest vulnerability severity."""
    if any(v["severity"] == "CRITICAL" for v in vulns):
        return "critical"
    if any(v["severity"] == "HIGH" for v in vulns):
        return "high"
    if any(v["severity"] == "MEDIUM" for v in vulns):
        return "medium"
    return "low"


def run_vuln_scanner(state: SecurityState) -> SecurityState:
    """Aggregate OWASP, header, and GitHub code findings into ``vulnerabilities``.

    Args:
        state: Pipeline state with anomalies and optional ``github_repo``.

    Returns:
        Updated state with vulnerabilities, risk level, and code scan metadata.
    """
    owasp_vulns = scan_for_owasp(state["anomalies"])
    # HTTP header checks apply to web apps, not IaC repo scans
    header_vulns = [] if state.get("github_repo") else check_api_headers({})

    scan = scan_github_code(state)
    code_findings = scan.get("code_findings", [])

    vulnerabilities = owasp_vulns + header_vulns + code_findings
    risk_level = _compute_risk_level(vulnerabilities)

    return {
        **state,
        "vulnerabilities": vulnerabilities,
        "risk_level": risk_level,
        "github_repo": scan.get("github_repo", state.get("github_repo", "")),
        "repo_languages": scan.get("repo_languages", {}),
        "primary_language": scan.get("primary_language", ""),
        "files_scanned": scan.get("files_scanned", 0),
        "code_findings": code_findings,
        "scan_error": scan.get("scan_error", ""),
    }
