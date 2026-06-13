"""Tests for FastAPI analysis endpoints and report retrieval."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

MOCK_STATE = {
    "raw_logs": [],
    "log_source": "synthetic",
    "session_id": "api-test",
    "anomalies": [
        {"type": "brute_force", "source_ip": "1.2.3.4", "severity": "CRITICAL"}
    ],
    "severity_map": {"brute_force": "CRITICAL"},
    "cve_matches": [],
    "threat_score": 50,
    "vulnerabilities": [],
    "risk_level": "high",
    "action_plan": ["Block IP", "Rotate keys"],
    "runbook_md": "# Runbook\n1. Block IP",
    "compliance_gaps": [],
    "compliance_score": 80,
}


def test_analyze_returns_session_id_without_blocking():
    with patch("main._run_analysis_background") as mock_bg:
        response = client.post("/analyze", json={"source": "synthetic"})
    assert response.status_code == 200
    assert "session_id" in response.json()
    mock_bg.assert_called_once()


def test_report_returns_404_while_running():
    response = client.get("/report/not-a-real-session")
    assert response.status_code == 404


def test_report_returns_full_state_when_complete():
    from main import _sessions

    _sessions["done-session"] = MOCK_STATE
    response = client.get("/report/done-session")
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "api-test"
    assert "action_plan" in data
