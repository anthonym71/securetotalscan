"""Docker Scanner agent — analyzes Docker Hub images for security issues."""

from state import SecurityState
from tools.docker_scanner import scan_docker_image_safe


def run_docker_scanner(state: SecurityState) -> SecurityState:
    """Scan a Docker Hub image when ``docker_image`` is set in state.

    Skips silently when no image is configured.

    Args:
        state: Pipeline state; uses ``docker_image`` field.

    Returns:
        Updated state with ``docker_findings`` and image metadata.
    """
    image = (state.get("docker_image") or "").strip()
    if not image:
        return {
            **state,
            "docker_findings": [],
            "docker_scan_error": "",
            "docker_skipped": True,
        }

    result = scan_docker_image_safe(image)
    findings = result.get("findings", [])

    # Merge docker findings into vulnerabilities for downstream agents
    vulnerabilities = list(state.get("vulnerabilities", [])) + findings

    risk_level = state.get("risk_level", "low")
    if any(f.get("severity") == "CRITICAL" for f in findings):
        risk_level = "critical"
    elif any(f.get("severity") == "HIGH" for f in findings) and risk_level not in ("critical",):
        risk_level = "high"
    elif any(f.get("severity") == "MEDIUM" for f in findings) and risk_level == "low":
        risk_level = "medium"

    return {
        **state,
        "docker_image": result.get("image_ref") or image,
        "docker_findings": findings,
        "docker_scan_error": result.get("scan_error", ""),
        "docker_skipped": False,
        "docker_trivy_available": result.get("trivy_available", False),
        "docker_trivy_ran": result.get("trivy_ran", False),
        "docker_trivy_cve_count": result.get("trivy_cve_count", 0),
        "docker_trivy_error": result.get("trivy_error", ""),
        "vulnerabilities": vulnerabilities,
        "risk_level": risk_level,
    }
