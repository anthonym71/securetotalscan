"""Tests for Threat Intel CVE lookup and threat score calculation."""

from unittest.mock import patch

from agents.threat_intel import run_threat_intel
from state import make_initial_state

MOCK_CVE = {
    "id": "CVE-2024-1234",
    "description": "SSH brute force vulnerability",
    "cvss_score": 9.1,
}


def test_run_threat_intel_populates_cve_matches():
    state = make_initial_state(raw_logs=[], log_source="synthetic", session_id="t1")
    state = {
        **state,
        "anomalies": [
            {
                "type": "brute_force",
                "source_ip": "192.168.1.42",
                "severity": "CRITICAL",
            }
        ],
    }

    with patch("agents.threat_intel.search_nvd_cve", return_value=[MOCK_CVE]):
        with patch(
            "agents.threat_intel.check_ip_reputation",
            return_value={"score": 90, "flagged": True},
        ):
            result = run_threat_intel(state)

    assert len(result["cve_matches"]) > 0
    assert result["threat_score"] > 0


def test_run_threat_intel_no_anomalies_returns_zero_score():
    state = make_initial_state(raw_logs=[], log_source="synthetic", session_id="t2")
    with patch("agents.threat_intel.search_nvd_cve", return_value=[]):
        with patch(
            "agents.threat_intel.check_ip_reputation",
            return_value={"score": 0, "flagged": False},
        ):
            result = run_threat_intel(state)
    assert result["threat_score"] == 0
