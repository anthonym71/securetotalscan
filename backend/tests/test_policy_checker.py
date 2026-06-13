"""Tests for NIST/SOC2 compliance mapping and Policy Checker agent."""

from agents.policy_checker import map_to_nist, map_to_soc2, run_policy_checker
from state import make_initial_state


def test_map_to_nist_brute_force():
    anomalies = [{"type": "brute_force", "severity": "CRITICAL"}]
    gaps = map_to_nist(anomalies)
    ids = [g["control_id"] for g in gaps]
    assert "PR.AC-1" in ids or "DE.CM-1" in ids


def test_map_to_soc2_auth_failure():
    anomalies = [{"type": "brute_force", "severity": "CRITICAL"}]
    gaps = map_to_soc2(anomalies)
    ids = [g["control_id"] for g in gaps]
    assert "CC6.1" in ids


def test_run_policy_checker_maps_code_findings():
    state = make_initial_state(
        raw_logs=[], log_source="github", session_id="pc2", github_repo="owner/repo"
    )
    state = {
        **state,
        "anomalies": [],
        "code_findings": [
            {
                "category": "OWASP-A01",
                "name": "Open Ingress CIDR (0.0.0.0/0)",
                "file": "main.tf",
                "line": 10,
                "recommendation": "Restrict CIDR",
                "severity": "CRITICAL",
            }
        ],
    }
    result = run_policy_checker(state)
    assert any("main.tf" in g["description"] for g in result["compliance_gaps"])


def test_run_policy_checker_produces_score():
    state = make_initial_state(raw_logs=[], log_source="synthetic", session_id="pc1")
    state = {
        **state,
        "anomalies": [{"type": "brute_force", "severity": "CRITICAL"}],
        "cve_matches": [{"id": "CVE-2024-1234", "cvss_score": 9.1}],
        "vulnerabilities": [{"category": "OWASP-A07", "severity": "CRITICAL"}],
        "risk_level": "critical",
        "action_plan": ["Block IP", "Rotate keys"],
    }
    result = run_policy_checker(state)
    assert 0 <= result["compliance_score"] <= 100
    assert len(result["compliance_gaps"]) > 0
    assert all("framework" in g for g in result["compliance_gaps"])
