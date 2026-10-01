"""Audit scope and review-only evidence must survive pipeline boundaries."""

from unittest.mock import patch

from agents.vuln_scanner import run_vuln_scanner
from agents.docker_scanner import run_docker_scanner
from orchestrator import _wrap
from state import make_initial_state


def test_scan_coverage_and_actual_count_survive_agent():
    state = make_initial_state([], "github", "coverage", github_repo="owner/repo")
    coverage = {
        "status": "incomplete", "inventory_complete": True,
        "eligible_files": 105, "scanned_files": 104,
        "failed_files": [{"path": "app.py", "reason": "fetch failed"}],
    }
    with patch("agents.vuln_scanner.scan_github_repo_safe", return_value={
        "files_scanned": 104, "scan_coverage": coverage, "code_findings": [],
    }):
        result = run_vuln_scanner(state)
    assert result["scan_coverage"] == coverage
    assert result["files_scanned"] == 104
    assert result["risk_level"] == "not_assessed"


def test_github_error_cannot_look_like_complete_clean_scan():
    state = make_initial_state([], "github", "failure", github_repo="owner/repo")
    with patch("agents.vuln_scanner.scan_github_repo_safe", return_value={"error": "GitHub API error: 401"}):
        result = run_vuln_scanner(state)
    assert result["scan_coverage"]["status"] == "incomplete"
    assert result["scan_coverage"]["inventory_complete"] is False
    assert result["risk_level"] == "not_assessed"
    assert result["scan_error"]


def test_fixture_notice_is_not_a_security_risk_rating():
    state = make_initial_state([], "github", "fixture", github_repo="owner/repo")
    with patch("agents.vuln_scanner.scan_github_repo_safe", return_value={
        "code_findings": [{"severity": "INFO", "disposition": "test_fixture"}],
    }):
        result = run_vuln_scanner(state)
    assert result["risk_level"] == "not_assessed"
    assert len(result["code_findings"]) == 1


def test_skipped_stage_does_not_claim_a_check_ran():
    state = make_initial_state([], "github", "stages")
    for agent, output in [("log_monitor", state), ("threat_intel", state),
                          ("docker_scanner", {**state, "docker_skipped": True})]:
        with patch("orchestrator.emit_sync") as emit, patch("orchestrator.record_agent_latency"):
            _wrap(agent, lambda _: output)(state)
        assert emit.call_args.args == ("stages", agent, "skipped")


def test_executed_stage_still_reports_done():
    state = make_initial_state([], "docker", "stages")
    with patch("orchestrator.emit_sync") as emit, patch("orchestrator.record_agent_latency"):
        _wrap("docker_scanner", lambda _: {**state, "docker_skipped": False})(state)
    assert emit.call_args.args == ("stages", "docker_scanner", "done")


def test_docker_candidate_updates_unassessed_severity():
    state = make_initial_state([], "docker", "severity", docker_image="alpine:latest")
    for severity in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
        with patch("agents.docker_scanner.scan_docker_image_safe", return_value={
            "findings": [{"severity": severity}],
        }):
            result = run_docker_scanner(state)
        assert result["risk_level"] == severity.lower()
