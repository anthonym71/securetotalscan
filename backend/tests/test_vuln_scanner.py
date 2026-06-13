"""Tests for OWASP mapping, header checks, and Vuln Scanner agent."""

from agents.vuln_scanner import check_api_headers, run_vuln_scanner, scan_for_owasp
from state import make_initial_state


def test_scan_for_owasp_path_traversal():
    anomalies = [
        {"type": "path_traversal", "detail": "/etc/passwd", "severity": "HIGH"}
    ]
    vulns = scan_for_owasp(anomalies)
    assert any(v["category"] == "OWASP-A01" for v in vulns)


def test_check_api_headers_missing():
    headers = {"Content-Type": "application/json"}
    findings = check_api_headers(headers)
    assert any(f["header"] == "X-Frame-Options" for f in findings)
    assert any(f["header"] == "Content-Security-Policy" for f in findings)


def test_run_vuln_scanner_populates_state():
    state = make_initial_state(raw_logs=[], log_source="synthetic", session_id="v1")
    state = {
        **state,
        "anomalies": [
            {"type": "path_traversal", "detail": "/etc/passwd", "severity": "HIGH"},
            {"type": "brute_force", "source_ip": "1.2.3.4", "severity": "CRITICAL"},
        ],
    }
    result = run_vuln_scanner(state)
    assert len(result["vulnerabilities"]) > 0
    assert result["risk_level"] in ("low", "medium", "high", "critical")
