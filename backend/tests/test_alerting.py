"""Tests for operational alerting.

The rules under test mirror ``scripts/verify-alerting.ts`` on the web tier:
unconfigured means silent, nothing sensitive leaves the process, and a failing
endpoint is swallowed but counted.
"""

import hashlib
import hmac
import json

import pytest

import alerting


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("ALERT_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("ALERT_WEBHOOK_SECRET", raising=False)
    alerting.reset_failure_count()
    yield
    alerting.reset_failure_count()


SECRET = "test-signing-secret"


def _configure(monkeypatch):
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://alerts.example.test/hook/wh_token")
    monkeypatch.setenv("ALERT_WEBHOOK_SECRET", SECRET)


class _Response:
    def __init__(self, status_code: int):
        self.status_code = status_code


def test_unconfigured_sends_nothing(monkeypatch):
    calls = []
    monkeypatch.setattr(alerting.httpx, "post", lambda *a, **k: calls.append(k))

    assert alerting.alerting_configured() is False
    assert alerting.send_alert_sync("critical", "backend-down") is False
    assert calls == []


def test_unconfigured_post_alert_starts_no_thread(monkeypatch):
    started = []
    monkeypatch.setattr(
        alerting.threading, "Thread", lambda *a, **k: started.append(k) or _Response(0)
    )
    alerting.post_alert(severity="critical", kind="backend-down")
    assert started == []


def test_signature_is_hmac_of_the_exact_body(monkeypatch):
    _configure(monkeypatch)
    captured = {}

    def fake_post(url, content, headers, timeout):
        captured["url"] = url
        captured["body"] = content
        captured["headers"] = headers
        captured["timeout"] = timeout
        return _Response(200)

    monkeypatch.setattr(alerting.httpx, "post", fake_post)

    assert alerting.send_alert_sync(
        "critical", "deep-scan-agent-error", detail="Agent vuln_scanner raised ValueError."
    ) is True

    expected = hmac.new(
        SECRET.encode(), captured["body"].encode(), hashlib.sha256
    ).hexdigest()
    assert captured["headers"][alerting.SIGNATURE_HEADER] == f"sha256={expected}"
    assert captured["headers"][alerting.TIMESTAMP_HEADER].isdigit()
    assert captured["timeout"] == alerting.TIMEOUT_SECONDS


def test_payload_carries_the_agreed_fields(monkeypatch):
    _configure(monkeypatch)
    captured = {}
    monkeypatch.setattr(
        alerting.httpx,
        "post",
        lambda url, content, headers, timeout: captured.update(body=content)
        or _Response(200),
    )

    alerting.send_alert_sync(
        "warning",
        "deep-scan-pipeline-error",
        site="example.com",
        customer=alerting.customer_ref("a@example.com"),
        detail="Deep run over github raised TimeoutError.",
        dedupe_key="deep-scan-pipeline-error:TimeoutError",
    )

    payload = json.loads(captured["body"])
    assert set(payload) == {
        "severity",
        "kind",
        "site",
        "customer",
        "detail",
        "occurred_at",
        "dedupe_key",
        "source",
    }
    assert payload["severity"] == "warning"
    assert payload["dedupe_key"] == "deep-scan-pipeline-error:TimeoutError"
    assert payload["source"] == "backend"


def test_dedupe_key_defaults_to_kind(monkeypatch):
    _configure(monkeypatch)
    captured = {}
    monkeypatch.setattr(
        alerting.httpx,
        "post",
        lambda url, content, headers, timeout: captured.update(body=content)
        or _Response(200),
    )
    alerting.send_alert_sync("info", "backend-restarted")
    assert json.loads(captured["body"])["dedupe_key"] == "backend-restarted"


@pytest.mark.parametrize(
    "detail,forbidden",
    [
        ("failed for anthony@example.com", "anthony@example.com"),
        ("Authorization: Bearer sk_live_abcdef123456", "sk_live_abcdef123456"),
        ("api_key=supersecretvalue", "supersecretvalue"),
        (
            "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef",
            "eyJhbGciOiJIUzI1NiJ9",
        ),
    ],
)
def test_redact_strips_credentials_and_addresses(detail, forbidden):
    assert forbidden not in alerting.redact(detail)


def test_redact_truncates():
    assert len(alerting.redact("x" * 2000)) <= alerting.MAX_DETAIL_CHARS


def test_customer_ref_is_pseudonymous_and_stable(monkeypatch):
    _configure(monkeypatch)
    ref = alerting.customer_ref("Anthony@Example.com")
    assert "@" not in ref and "anthony" not in ref
    assert ref == alerting.customer_ref(" anthony@example.com ")
    assert ref != alerting.customer_ref("someone@example.com")
    assert ref.startswith("c_") and len(ref) == 18


def test_customer_ref_is_empty_without_a_secret():
    assert alerting.customer_ref("a@example.com") == ""


def test_endpoint_error_is_swallowed_and_counted(monkeypatch):
    _configure(monkeypatch)

    def boom(*args, **kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(alerting.httpx, "post", boom)

    assert alerting.send_alert_sync("critical", "backend-down") is False
    assert alerting.failure_count() == 1


def test_endpoint_5xx_is_counted(monkeypatch):
    _configure(monkeypatch)
    monkeypatch.setattr(
        alerting.httpx, "post", lambda *a, **k: _Response(503)
    )
    assert alerting.send_alert_sync("critical", "backend-down") is False
    assert alerting.failure_count() == 1


def test_post_alert_never_raises(monkeypatch):
    _configure(monkeypatch)

    def boom(*args, **kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(alerting.httpx, "post", boom)
    # Returns immediately; the daemon thread absorbs the failure.
    alerting.post_alert(severity="critical", kind="backend-down")
