"""Threat Intel agent — enriches anomalies with CVE, IP reputation, and RAG context."""

from rag.retriever import retrieve
from state import SecurityState
from tools.abuseipdb import check_ip_reputation
from tools.nvd_api import search_nvd_cve

ANOMALY_KEYWORDS = {
    "brute_force": "SSH brute force",
    "port_scan": "port scan network reconnaissance",
    "path_traversal": "path traversal directory",
    "sudo_failure": "privilege escalation sudo",
}


def _record_query(
    queries: list[dict],
    *,
    agent: str,
    query: str,
    chunk_count: int,
    linked_to: str,
) -> None:
    queries.append(
        {
            "agent": agent,
            "query": query,
            "chunk_count": chunk_count,
            "linked_to": linked_to,
        }
    )


def run_threat_intel(state: SecurityState) -> SecurityState:
    """Look up CVEs, IP reputation, and RAG threat context; compute threat score.

    Args:
        state: Pipeline state with ``anomalies`` populated.

    Returns:
        Updated state with ``cve_matches``, ``threat_score``, and RAG context.
    """
    anomalies = state["anomalies"]
    cve_matches = []
    ip_scores = []
    threat_intel_context: list[dict] = list(state.get("threat_intel_context", []))
    rag_queries: list[dict] = list(state.get("rag_queries", []))

    for anomaly in anomalies:
        keyword = ANOMALY_KEYWORDS.get(anomaly["type"], anomaly["type"])
        cves = search_nvd_cve(keyword)
        cve_ids = " ".join(c["id"] for c in cves[:3])
        rag_query = f"{anomaly['type']} {keyword} {cve_ids}".strip()

        chunks = retrieve(
            rag_query,
            doc_types=["runbook", "threat_pattern"],
            tags=[anomaly["type"]],
            k=3,
        )
        _record_query(
            rag_queries,
            agent="threat_intel",
            query=rag_query,
            chunk_count=len(chunks),
            linked_to=anomaly["type"],
        )
        for chunk in chunks:
            threat_intel_context.append(chunk.to_dict(linked_to=anomaly["type"]))

        rag_snippets = [c.text[:400] for c in chunks[:2]]
        for cve in cves:
            cve_matches.append(
                {
                    **cve,
                    "linked_anomaly": anomaly["type"],
                    "rag_context": rag_snippets,
                }
            )

        ip = anomaly.get("source_ip")
        if ip and ip not in ("unknown", "127.0.0.1"):
            rep = check_ip_reputation(ip)
            ip_scores.append(rep["score"])

    threat_score = min(
        100, int(sum(ip_scores) / max(len(ip_scores), 1)) + len(cve_matches) * 5
    )
    return {
        **state,
        "cve_matches": cve_matches,
        "threat_score": threat_score,
        "threat_intel_context": threat_intel_context,
        "rag_queries": rag_queries,
    }
