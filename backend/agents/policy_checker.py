"""Policy Checker agent — maps findings to NIST, SOC 2, and ISO 27001 compliance gaps."""

from state import SecurityState
from tools.rag import retrieve_context

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

ISO27001_MAP = {
    "brute_force": [
        ("A.8.5", "Secure authentication"),
        ("A.8.16", "Monitoring activities"),
    ],
    "port_scan": [
        ("A.8.20", "Networks security"),
        ("A.8.16", "Monitoring activities"),
    ],
    "path_traversal": [
        ("A.8.3", "Information access restriction"),
        ("A.8.12", "Data leakage prevention"),
    ],
    "sudo_failure": [
        ("A.8.2", "Privileged access rights"),
        ("A.8.5", "Secure authentication"),
    ],
}


def map_to_nist(anomalies: list[dict]) -> list[dict]:
    """Map log anomalies to NIST CSF 2.0 control gaps."""
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
    """Map log anomalies to SOC 2 Type II control gaps."""
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


def map_to_iso27001(anomalies: list[dict]) -> list[dict]:
    """Map log anomalies to ISO 27001 control gaps."""
    seen, gaps = set(), []
    for a in anomalies:
        for control_id, desc in ISO27001_MAP.get(a["type"], []):
            key = f"iso:{control_id}"
            if key not in seen:
                seen.add(key)
                gaps.append(
                    {
                        "framework": "ISO 27001",
                        "control_id": control_id,
                        "description": desc,
                        "severity": a["severity"],
                    }
                )
    return gaps


def map_docker_findings_to_compliance(findings: list[dict]) -> list[dict]:
    """Map Docker image findings to ISO 27001 container security gaps."""
    gaps = []
    seen: set[str] = set()
    for f in findings:
        key = f.get("name", "")
        if key in seen:
            continue
        seen.add(key)
        gaps.append(
            {
                "framework": "ISO 27001",
                "control_id": "A.8.25",
                "description": f"{f.get('name')} — {f.get('recommendation', '')}",
                "severity": f.get("severity", "MEDIUM"),
            }
        )
    return gaps


def map_code_findings_to_compliance(findings: list[dict]) -> list[dict]:
    """Map GitHub code scan findings to NIST-style compliance gaps."""
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


def map_rag_to_compliance(retrieved: list[dict]) -> list[dict]:
    """Surface RAG-retrieved controls as compliance references."""
    gaps = []
    for chunk in retrieved:
        gaps.append(
            {
                "framework": chunk.get("framework", "Knowledge Base"),
                "control_id": chunk.get("id", "RAG"),
                "description": chunk.get("title", ""),
                "severity": "INFO",
                "rag_content": chunk.get("content", ""),
            }
        )
    return gaps


def run_policy_checker(state: SecurityState) -> SecurityState:
    """Compute compliance gaps and score from anomalies, code, Docker, and RAG."""
    anomalies = state["anomalies"]
    retrieved = retrieve_context(state)
    gaps = (
        map_to_nist(anomalies)
        + map_to_soc2(anomalies)
        + map_to_iso27001(anomalies)
    )

    code_gaps = map_code_findings_to_compliance(state.get("code_findings", []))
    gaps.extend(code_gaps)

    docker_gaps = map_docker_findings_to_compliance(state.get("docker_findings", []))
    gaps.extend(docker_gaps)

    rag_gaps = map_rag_to_compliance(retrieved)
    gaps.extend(rag_gaps)

    # Non-RAG gaps affect score; RAG references are informational
    score_gaps = [g for g in gaps if g.get("severity") != "INFO"]
    score = max(0, 100 - len(score_gaps) * 5)

    return {
        **state,
        "retrieved_sources": retrieved,
        "compliance_gaps": gaps,
        "compliance_score": score,
    }
