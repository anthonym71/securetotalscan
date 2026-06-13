"""Threat Intel agent — enriches anomalies with CVE and IP reputation data."""

from state import SecurityState
from tools.abuseipdb import check_ip_reputation
from tools.nvd_api import search_nvd_cve

ANOMALY_KEYWORDS = {
    "brute_force": "SSH brute force",
    "port_scan": "port scan network reconnaissance",
    "path_traversal": "path traversal directory",
    "sudo_failure": "privilege escalation sudo",
}


def run_threat_intel(state: SecurityState) -> SecurityState:
    """Look up CVEs and IP reputation for each anomaly and compute threat score.

    Args:
        state: Pipeline state with ``anomalies`` populated.

    Returns:
        Updated state with ``cve_matches`` and ``threat_score`` (0–100).
    """
    anomalies = state["anomalies"]
    cve_matches = []
    ip_scores = []

    for anomaly in anomalies:
        keyword = ANOMALY_KEYWORDS.get(anomaly["type"], anomaly["type"])
        cves = search_nvd_cve(keyword)
        for cve in cves:
            cve_matches.append({**cve, "linked_anomaly": anomaly["type"]})

        ip = anomaly.get("source_ip")
        if ip and ip not in ("unknown", "127.0.0.1"):
            rep = check_ip_reputation(ip)
            ip_scores.append(rep["score"])

    threat_score = min(
        100, int(sum(ip_scores) / max(len(ip_scores), 1)) + len(cve_matches) * 5
    )
    return {**state, "cve_matches": cve_matches, "threat_score": threat_score}
