"""Tests for service-to-service authentication on the agent backend."""

import os

import pytest
from fastapi.testclient import TestClient

from conftest import TEST_SERVICE_TOKEN
from main import app
from service_auth import configured_token, is_exempt, token_matches

client = TestClient(app)

PROTECTED = "/evals"


def test_valid_token_is_accepted():
    response = client.get(PROTECTED)
    assert response.status_code == 200


def test_missing_header_is_rejected():
    response = client.get(PROTECTED, headers={"x-sts-service-auth": ""})
    assert response.status_code == 401
    assert "detail" in response.json()


def test_wrong_token_is_rejected():
    response = client.get(
        PROTECTED, headers={"x-sts-service-auth": "not-the-right-token-aaaaaaaaaaaaaaa"}
    )
    assert response.status_code == 401


def test_token_prefix_is_rejected():
    """A truncated token must not pass — the comparison is not a prefix match."""
    response = client.get(
        PROTECTED, headers={"x-sts-service-auth": TEST_SERVICE_TOKEN[:-1]}
    )
    assert response.status_code == 401


def test_error_body_never_leaks_the_secret():
    response = client.get(PROTECTED, headers={"x-sts-service-auth": "wrong"})
    assert TEST_SERVICE_TOKEN not in response.text


def test_post_endpoints_are_protected():
    response = client.post(
        "/analyze", json={"source": "synthetic"}, headers={"x-sts-service-auth": "wrong"}
    )
    assert response.status_code == 401


def test_health_endpoint_stays_exempt():
    response = client.get("/health/trivy", headers={"x-sts-service-auth": "wrong"})
    assert response.status_code == 200


def test_fails_closed_when_secret_is_absent(monkeypatch):
    monkeypatch.delenv("STS_SERVICE_TOKEN", raising=False)
    response = client.get(PROTECTED)
    assert response.status_code == 503


def test_fails_closed_when_secret_is_too_weak(monkeypatch):
    monkeypatch.setenv("STS_SERVICE_TOKEN", "short")
    response = client.get(PROTECTED, headers={"x-sts-service-auth": "short"})
    assert response.status_code == 503


@pytest.mark.parametrize("path", ["/health/trivy", "/health", "/"])
def test_exempt_paths(path):
    assert is_exempt(path)


@pytest.mark.parametrize("path", ["/analyze", "/evals", "/report/abc", "/docs"])
def test_non_exempt_paths(path):
    assert not is_exempt(path)


def test_token_matches_helpers():
    assert token_matches(TEST_SERVICE_TOKEN, TEST_SERVICE_TOKEN)
    assert token_matches(f"  {TEST_SERVICE_TOKEN}  ", TEST_SERVICE_TOKEN)
    assert not token_matches(None, TEST_SERVICE_TOKEN)
    assert not token_matches("", TEST_SERVICE_TOKEN)
    assert not token_matches("x", TEST_SERVICE_TOKEN)


def test_configured_token_reads_environment(monkeypatch):
    monkeypatch.setenv("STS_SERVICE_TOKEN", "a" * 40)
    assert configured_token() == "a" * 40
    monkeypatch.setenv("STS_SERVICE_TOKEN", "tooshort")
    assert configured_token() is None
    monkeypatch.delenv("STS_SERVICE_TOKEN", raising=False)
    assert configured_token() is None


def test_env_does_not_contain_a_production_looking_secret():
    """Guard against a real token being committed into the test setup."""
    assert os.environ["STS_SERVICE_TOKEN"].startswith("test-")
