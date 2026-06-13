"""Policy Checker agent — maps findings to NIST/SOC2 gaps with RAG remediation."""

from rag.retriever import retrieve
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


def _enrich_gap_with_rag(
    gap: dict,
    *,
    compliance_context: list[dict],
    rag_queries: list[dict],
) -> None:
    doc_types = ["nist"] if "NIST" in gap.get("framework", "") else ["soc2"]
    rag_query = f"{gap['control_id']} {gap['description']} remediation compliance"
    chunks = retrieve(rag_query, doc_types=doc_types, k=2)

    rag_queries.append(
        {
            "agent": "policy_checker",
            "query": rag_query,
            "chunk_count": len(chunks),
            "linked_to": gap["control_id"],
        }
    )

    if chunks:
        gap["rag_remediation"] = chunks[0].text[:600]
        gap["rag_sources"] = [c.source for c in chunks]
        for chunk in chunks:
            compliance_context.append(chunk.to_dict(linked_to=gap["control_id"]))
    else:
        gap["rag_remediation"] = ""
        gap["rag_sources"] = []


def run_policy_checker(state: SecurityState) -> SecurityState:
    """Compute compliance gaps and score; enrich with RAG control guidance."""
    anomalies = state["anomalies"]
    gaps = map_to_nist(anomalies) + map_to_soc2(anomalies)
    gaps.extend(map_code_findings_to_compliance(state.get("code_findings", [])))

    compliance_context: list[dict] = list(state.get("compliance_context", []))
    rag_queries: list[dict] = list(state.get("rag_queries", []))

    for gap in gaps:
        _enrich_gap_with_rag(
            gap,
            compliance_context=compliance_context,
            rag_queries=rag_queries,
        )

    score = max(0, 100 - len(gaps) * 5)
    return {
        **state,
        "compliance_gaps": gaps,
        "compliance_score": score,
        "compliance_context": compliance_context,
        "rag_queries": rag_queries,
    }
