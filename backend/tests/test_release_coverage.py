"""Release-gate coverage endpoint tests."""
from fastapi.testclient import TestClient

import main
import tools.github_scanner as github_scanner

client = TestClient(main.app)


def test_release_coverage_returns_compact_receipt(monkeypatch):
    monkeypatch.setattr(
        github_scanner,
        "scan_github_repo_safe",
        lambda _url: {
            "github_repo": "anthonym71/securetotalscan",
            "commit_sha": "a" * 40,
            "files_scanned": 160,
            "scan_coverage": {
                "status": "complete",
                "inventory_complete": True,
                "eligible_files": 160,
                "scanned_files": 160,
                "failed_files": [],
                "incomplete_reasons": [],
            },
        },
    )
    response = client.post(
        "/ops/verify-github-coverage",
        json={"repo_url": "https://github.com/anthonym71/securetotalscan"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["scanned_files"] == 160
    assert body["eligible_files"] == 160
    assert body["failed_files"] == 0
    assert body["coverage_status"] == "complete"


def test_release_coverage_fails_closed_on_scan_error(monkeypatch):
    monkeypatch.setattr(
        github_scanner,
        "scan_github_repo_safe",
        lambda _url: {"error": "GitHub rejected the credentials (401)"},
    )
    response = client.post(
        "/ops/verify-github-coverage",
        json={"repo_url": "https://github.com/anthonym71/securetotalscan"},
    )
    assert response.status_code == 502
    assert "401" in response.json()["detail"]
