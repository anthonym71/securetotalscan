"""Policy Checker agent — maps findings to NIST and SOC 2 compliance gaps."""

from state import SecurityState

NIST_MAP = {
    "brute_force": [
        ("PR.AC-1", "Identities and credentials are managed"),
        ("DE.CM-1", "Network is monitored"),
    ],
    "port_scan": [
        ("DE.CM-1", "Network is monitored"),
        ("PR.PT-4", "Communications protected"),
    ],
    "path_traversal": [
        ("PR.AC-4", "Access permissions managed"),
        ("PR.DS-5", "Protections against data leaks"),
    ],
    "sudo_failure": [
        ("PR.AC-1", "Identities and credentials are managed"),
        ("PR.AC-6", "Identities are proofed"),
    ],
}

SOC2_MAP = {
    "brute_force": [
        ("CC6.1", "Logical access security"),
        ("CC7.2", "Monitors system components"),
    ],
    "port_scan": [
        ("CC6.6", "Unauthorized access prevented"),
        ("CC7.2", "Monitors system components"),
    ],
    "path_traversal": [
        ("CC6.1", "Logical access security"),
        ("CC6.3", "Access removed when no longer needed"),
    ],
    "sudo_failure": [
        ("CC6.1", "Logical access security"),
        ("CC6.2", "Prior to issuing credentials"),
    ],
}


def map_to_nist(anomalies: list[dict]) -> list[dict]:
    """Map log anomalies to NIST CSF 2.0 control gaps.

    Args:
        anomalies: Detected anomalies from the Log Monitor.

    Returns:
        Deduplicated list of compliance gap dicts.
    """
    seen, gaps = set(), []
    for a in anomalies:
        for control_id, desc in NIST_MAP.get(a["type"], []):
            if control_id not in seen:
                seen.add(control_id)
                gaps.append(
                    {
                        "framework": "NIST CSF 2.0",
                        "control_id": control_id,
                        "description": desc,
                        "severity": a["severity"],
                    }
                )
    return gaps


def map_to_soc2(anomalies: list[dict]) -> list[dict]:
    """Map log anomalies to SOC 2 Type II control gaps.

    Args:
        anomalies: Detected anomalies from the Log Monitor.

    Returns:
        Deduplicated list of compliance gap dicts.
    """
    seen, gaps = set(), []
    for a in anomalies:
        for control_id, desc in SOC2_MAP.get(a["type"], []):
            if control_id not in seen:
                seen.add(control_id)
                gaps.append(
                    {
                        "framework": "SOC 2 Type II",
                        "control_id": control_id,
                        "description": desc,
                        "severity": a["severity"],
                    }
                )
    return gaps


def map_code_findings_to_compliance(findings: list[dict]) -> list[dict]:
    """Map GitHub code scan findings to NIST-style compliance gaps.

    Args:
        findings: Static analysis results from ``github_scanner``.

    Returns:
        One gap entry per unique code finding.
    """
    gaps = []
    seen: set[str] = set()
    for f in findings:
        key = f"{f.get('category')}:{f.get('file')}:{f.get('line')}"
        if key in seen:
            continue
        seen.add(key)
        gaps.append(
            {
                "framework": "NIST CSF 2.0",
                "control_id": f.get("category", "DE.CM-8"),
                "description": f"{f.get('name')} in {f.get('file', '?')} — {f.get('recommendation', '')}",
                "severity": f.get("severity", "MEDIUM"),
            }
        )
    return gaps


def run_policy_checker(state: SecurityState) -> SecurityState:
    """Compute compliance gaps and score from anomalies and code findings.

    Args:
        state: Pipeline state with ``anomalies`` and optional ``code_findings``.

    Returns:
        Updated state with ``compliance_gaps`` and ``compliance_score``.
    """
    anomalies = state["anomalies"]
    gaps = map_to_nist(anomalies) + map_to_soc2(anomalies)

    code_gaps = map_code_findings_to_compliance(state.get("code_findings", []))
    gaps.extend(code_gaps)

    score = max(0, 100 - len(gaps) * 5)
    return {**state, "compliance_gaps": gaps, "compliance_score": score}
