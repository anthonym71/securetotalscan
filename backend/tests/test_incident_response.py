"""Tests for Incident Response prompt building, LLM calls, and fallback plans."""

from unittest.mock import patch

from agents.incident_response import (
    _fallback_action_plan,
    build_prompt,
    run_incident_response,
)
from state import make_initial_state


def test_build_prompt_includes_anomalies_and_cves():
    state = make_initial_state(raw_logs=[], log_source="synthetic", session_id="ir1")
    state = {
        **state,
        "anomalies": [
            {
                "type": "brute_force",
                "source_ip": "192.168.1.42",
                "severity": "CRITICAL",
            }
        ],
        "cve_matches": [
            {"id": "CVE-2024-1234", "cvss_score": 9.1, "description": "SSH vuln"}
        ],
        "vulnerabilities": [
            {"category": "OWASP-A07", "name": "Auth Failures", "severity": "CRITICAL"}
        ],
        "threat_score": 75,
    }
    prompt = build_prompt(state)
    assert "brute_force" in prompt
    assert "CVE-2024-1234" in prompt
    assert "OWASP-A07" in prompt


def test_run_incident_response_populates_action_plan():
    state = make_initial_state(raw_logs=[], log_source="synthetic", session_id="ir2")
    state = {
        **state,
        "anomalies": [
            {
                "type": "brute_force",
                "source_ip": "192.168.1.42",
                "severity": "CRITICAL",
            }
        ],
        "cve_matches": [],
        "vulnerabilities": [],
        "threat_score": 50,
    }
    mock_response = "1. Block IP\n2. Rotate keys\n3. Enable 2FA"
    with patch("agents.incident_response.call_openai", return_value=mock_response):
        result = run_incident_response(state)
    assert len(result["action_plan"]) == 3
    assert "Block IP" in result["action_plan"][0]
    assert len(result["runbook_md"]) > 0


def test_fallback_action_plan_from_code_findings():
    state = make_initial_state(
        raw_logs=[], log_source="github", session_id="ir3", github_repo="aws-samples/terraform-aws-batch"
    )
    state = {
        **state,
        "code_findings": [
            {
                "name": "Open Ingress CIDR (0.0.0.0/0)",
                "file": "main.tf",
                "line": 42,
                "recommendation": "Restrict ingress to specific CIDR blocks",
            }
        ],
        "vulnerabilities": [],
    }
    steps = _fallback_action_plan(state)
    assert len(steps) >= 1
    assert "main.tf" in steps[0]
    assert "0.0.0.0/0" in steps[0] or "Open Ingress" in steps[0]


def test_run_incident_response_uses_fallback_for_log_anomalies():
    state = make_initial_state(raw_logs=[], log_source="synthetic", session_id="ir5")
    state = {
        **state,
        "anomalies": [
            {
                "type": "brute_force",
                "source_ip": "192.168.1.42",
                "attempt_count": 5,
                "severity": "CRITICAL",
                "title": "SSH Brute Force Attack",
                "recommendation": "Block the attacking IP at the firewall",
            }
        ],
        "cve_matches": [],
        "vulnerabilities": [],
        "threat_score": 80,
    }
    with patch("agents.incident_response.call_openai", side_effect=RuntimeError("no api key")):
        result = run_incident_response(state)
    assert len(result["action_plan"]) >= 1
    assert "192.168.1.42" in result["action_plan"][0]
    assert "firewall" in result["action_plan"][0].lower()


def test_run_incident_response_uses_fallback_when_llm_fails():
    state = make_initial_state(
        raw_logs=[], log_source="github", session_id="ir4", github_repo="owner/repo"
    )
    state = {
        **state,
        "anomalies": [],
        "cve_matches": [],
        "vulnerabilities": [],
        "code_findings": [
            {
                "name": "Wildcard IAM Action",
                "file": "iam.tf",
                "line": 10,
                "recommendation": "Use least-privilege IAM actions",
            }
        ],
        "threat_score": 30,
    }
    with patch("agents.incident_response.call_openai", side_effect=RuntimeError("no api key")):
        result = run_incident_response(state)
    assert len(result["action_plan"]) >= 1
    assert "iam.tf" in result["action_plan"][0]
