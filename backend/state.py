"""Shared pipeline state definitions for the LangGraph security agents."""

from typing import TypedDict


class SecurityState(TypedDict):
    """Accumulated inputs and outputs for a single analysis session.

    Each agent reads from and returns an updated ``SecurityState`` as it runs
    through the LangGraph pipeline.
    """

    raw_logs: list[str]
    log_source: str
    session_id: str
    target_url: str
    docker_image: str
    anomalies: list[dict]
    severity_map: dict[str, str]
    cve_matches: list[dict]
    threat_score: int
    vulnerabilities: list[dict]
    risk_level: str
    docker_findings: list[dict]
    docker_scan_error: str
    docker_skipped: bool
    docker_trivy_available: bool
    docker_trivy_ran: bool
    docker_trivy_cve_count: int
    docker_trivy_error: str
    retrieved_sources: list[dict]
    action_plan: list[str]
    runbook_md: str
    compliance_gaps: list[dict]
    compliance_score: int
    github_repo: str
    repo_languages: dict[str, float]
    primary_language: str
    files_scanned: int
    code_findings: list[dict]
    scan_error: str
    slack_webhook_url: str
    slack_sent: bool
    slack_error: str
    slack_skipped: bool


def make_initial_state(
    raw_logs: list[str],
    log_source: str,
    session_id: str,
    github_repo: str = "",
    slack_webhook_url: str = "",
    target_url: str = "",
    docker_image: str = "",
) -> SecurityState:
    """Create a fresh ``SecurityState`` with empty agent output fields.

    Args:
        raw_logs: Log lines to analyze (may be empty for code-only GitHub scans).
        log_source: One of ``synthetic``, ``system``, ``upload``, ``github``, or ``docker``.
        session_id: UUID for this analysis run.
        github_repo: Optional ``owner/repo`` when scanning a GitHub repository.
        slack_webhook_url: Optional Slack incoming webhook for incident alerts.
        target_url: Optional public URL for HTTP header security checks.
        docker_image: Optional Docker Hub image reference to scan.

    Returns:
        Initial state ready for the Log Monitor entry point.
    """
    return SecurityState(
        raw_logs=raw_logs,
        log_source=log_source,
        session_id=session_id,
        target_url=target_url,
        docker_image=docker_image,
        anomalies=[],
        severity_map={},
        cve_matches=[],
        threat_score=0,
        vulnerabilities=[],
        risk_level="low",
        docker_findings=[],
        docker_scan_error="",
        docker_skipped=True,
        docker_trivy_available=False,
        docker_trivy_ran=False,
        docker_trivy_cve_count=0,
        docker_trivy_error="",
        retrieved_sources=[],
        action_plan=[],
        runbook_md="",
        compliance_gaps=[],
        compliance_score=0,
        github_repo=github_repo,
        repo_languages={},
        primary_language="",
        files_scanned=0,
        code_findings=[],
        scan_error="",
        slack_webhook_url=slack_webhook_url,
        slack_sent=False,
        slack_error="",
        slack_skipped=True,
    )
