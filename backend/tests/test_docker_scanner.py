"""Tests for Docker Hub image parsing, Trivy integration, and Docker Scanner agent."""

from unittest.mock import patch

from agents.docker_scanner import run_docker_scanner
from state import make_initial_state
from tools.docker_scanner import (
    TrivyScanResult,
    _parse_trivy_json,
    parse_docker_image_ref,
    run_trivy_scan,
    scan_docker_image,
)


def test_parse_docker_image_ref_simple():
    ns, repo, tag = parse_docker_image_ref("nginx:latest")
    assert ns == "library"
    assert repo == "nginx"
    assert tag == "latest"


def test_parse_docker_image_ref_hub_url():
    ns, repo, tag = parse_docker_image_ref("https://hub.docker.com/r/library/redis")
    assert ns == "library"
    assert repo == "redis"
    assert tag == "latest"


def test_parse_docker_image_ref_namespaced():
    ns, repo, tag = parse_docker_image_ref("bitnami/nginx:1.25")
    assert ns == "bitnami"
    assert repo == "nginx"
    assert tag == "1.25"


def test_parse_trivy_json_extracts_cves():
    payload = {
        "Results": [
            {
                "Vulnerabilities": [
                    {
                        "VulnerabilityID": "CVE-2024-1234",
                        "PkgName": "openssl",
                        "Severity": "HIGH",
                        "InstalledVersion": "1.1.1",
                        "FixedVersion": "1.1.2",
                        "Title": "OpenSSL issue",
                    },
                    {
                        "VulnerabilityID": "CVE-2024-5678",
                        "PkgName": "curl",
                        "Severity": "CRITICAL",
                        "Title": "curl RCE",
                    },
                ]
            }
        ]
    }
    findings, total = _parse_trivy_json(payload, "nginx:latest", 10)
    assert total == 2
    assert findings[0]["name"] == "CVE-2024-5678"
    assert findings[0]["source"] == "trivy"


@patch("tools.docker_scanner.run_trivy_scan")
@patch("tools.docker_scanner._fetch_tag")
@patch("tools.docker_scanner._fetch_repo")
def test_scan_docker_image_includes_trivy_findings(mock_repo, mock_tag, mock_trivy):
    mock_repo.return_value = {
        "is_official": True,
        "pull_count": 1_000_000,
        "last_updated": "2025-01-01T00:00:00Z",
    }
    mock_tag.return_value = {"last_updated": "2025-01-01T00:00:00Z"}
    mock_trivy.return_value = TrivyScanResult(
        findings=[
            {
                "source": "trivy",
                "category": "CVE",
                "name": "CVE-2024-9999",
                "severity": "HIGH",
                "recommendation": "Upgrade pkg",
                "fix_prompt": "Fix CVE",
            }
        ],
        ran=True,
        available=True,
        cve_count=1,
        error="",
    )
    result = scan_docker_image("nginx:1.25")
    assert result["trivy_ran"] is True
    assert result["trivy_cve_count"] == 1
    assert any(f["name"] == "CVE-2024-9999" for f in result["findings"])


@patch("tools.docker_scanner.run_trivy_scan")
@patch("tools.docker_scanner._fetch_tag")
@patch("tools.docker_scanner._fetch_repo")
def test_scan_docker_image_latest_tag(mock_repo, mock_tag, mock_trivy):
    mock_repo.return_value = {
        "is_official": True,
        "pull_count": 1_000_000,
        "last_updated": "2025-01-01T00:00:00Z",
    }
    mock_tag.return_value = {"last_updated": "2025-01-01T00:00:00Z"}
    mock_trivy.return_value = TrivyScanResult([], True, True, 0, "")
    result = scan_docker_image("nginx:latest")
    assert result["namespace"] == "library"
    assert any(f["name"] == "Using :latest tag" for f in result["findings"])


@patch("tools.docker_scanner.resolve_trivy_binary", return_value="/usr/local/bin/trivy")
@patch("tools.docker_scanner.ensure_trivy_db", return_value=None)
@patch("tools.docker_scanner.subprocess.run")
def test_run_trivy_scan_parses_json(mock_run, _db, _bin):
    mock_run.return_value.returncode = 1
    mock_run.return_value.stdout = """
    {
      "Results": [{
        "Vulnerabilities": [{
          "VulnerabilityID": "CVE-2024-0001",
          "PkgName": "zlib",
          "Severity": "MEDIUM",
          "Title": "zlib bug"
        }]
      }]
    }
    """
    mock_run.return_value.stderr = ""
    result = run_trivy_scan("docker.io/library/nginx:1.25")
    assert result.ran is True
    assert result.cve_count == 1
    assert result.findings[0]["name"] == "CVE-2024-0001"


def test_run_docker_scanner_skips_without_image():
    state = make_initial_state(raw_logs=[], log_source="docker", session_id="ds1")
    result = run_docker_scanner(state)
    assert result["docker_skipped"] is True
    assert result["docker_findings"] == []


@patch("agents.docker_scanner.scan_docker_image_safe")
def test_run_docker_scanner_populates_findings(mock_scan):
    mock_scan.return_value = {
        "image_ref": "nginx:latest",
        "findings": [
            {
                "name": "Using :latest tag",
                "severity": "HIGH",
                "recommendation": "Pin tag",
                "fix_prompt": "Pin nginx version",
            }
        ],
        "scan_error": "",
        "trivy_available": True,
        "trivy_ran": True,
        "trivy_cve_count": 0,
        "trivy_error": "",
    }
    state = make_initial_state(
        raw_logs=[], log_source="docker", session_id="ds2", docker_image="nginx:latest"
    )
    state = {**state, "vulnerabilities": [], "risk_level": "low"}
    result = run_docker_scanner(state)
    assert result["docker_skipped"] is False
    assert len(result["docker_findings"]) == 1
    assert result["risk_level"] == "high"
    assert result["docker_trivy_ran"] is True
