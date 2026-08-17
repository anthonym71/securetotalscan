"""Operational alerting — backend tier.

Posts an HMAC-signed JSON alert to an external on-call endpoint. The wire
format, severity rules and the receiver's obligations are in
``docs/ALERTING.md``; this module is the FastAPI half of the same contract
implemented for the web tier in ``lib/alerting.ts``.

Three rules govern everything here:

1. An alert must never break an analysis run. The send happens on a daemon
   thread, is bounded by a short timeout, and every failure path is swallowed.
2. Swallowing is not the same as ignoring. Failures are counted and logged,
   because "alerting broke and nothing said so" is the exact blind spot this
   module exists to close.
3. Nothing sensitive leaves the process — no secrets, no tokens, no request
   bodies, no raw email addresses. ``redact`` is a backstop; call sites should
   pass a short description they wrote themselves.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import threading
from datetime import datetime, timezone
from typing import Literal

import httpx

Severity = Literal["critical", "warning", "info"]

TIMEOUT_SECONDS = 2.0
MAX_DETAIL_CHARS = 500

#: Signature header, ``sha256=<hex>`` over the exact request body.
SIGNATURE_HEADER = "x-sts-signature"
#: Send time as epoch seconds, so a stale replay is detectable.
TIMESTAMP_HEADER = "x-sts-timestamp"

# Values that look like credentials, stripped before anything is sent. The list
# is deliberately blunt: over-redacting an alert costs a little context,
# under-redacting one posts a secret to a third party.
_SECRET_PATTERNS = [
    re.compile(r"\b(?:bearer|basic)\s+[\w\-._~+/]+=*", re.IGNORECASE),
    re.compile(
        r"\b(?:sk|pk|rk|whsec|xoxb|xoxp|ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_\-]{8,}"
    ),
    re.compile(
        r"\b[A-Za-z0-9_\-]*(?:secret|token|password|passwd|apikey|api_key)"
        r"[A-Za-z0-9_\-]*\s*[=:]\s*\S+",
        re.IGNORECASE,
    ),
    re.compile(r"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),
    # Bare email addresses — customer identity travels as customer_ref() only.
    re.compile(r"\b[^@\s]+@[^@\s]+\.[^@\s]{2,}\b"),
]

_failure_lock = threading.Lock()
_failure_count = 0


def failure_count() -> int:
    """Number of sends this process could not complete."""
    with _failure_lock:
        return _failure_count


def reset_failure_count() -> None:
    """Test seam."""
    global _failure_count
    with _failure_lock:
        _failure_count = 0


def _record_failure(message: str) -> None:
    global _failure_count
    with _failure_lock:
        _failure_count += 1
        count = _failure_count
    # Logged, not alerted on — alerting about alerting failing needs a path
    # that is already broken.
    print(f"alert: {message} ({count} failed send(s) in this process)")


def alerting_configured() -> bool:
    """True when both the endpoint and the signing secret are present."""
    return bool(os.getenv("ALERT_WEBHOOK_URL") and os.getenv("ALERT_WEBHOOK_SECRET"))


def redact(detail: str) -> str:
    """Strip credential-shaped substrings and email addresses, then truncate."""
    out = detail
    for pattern in _SECRET_PATTERNS:
        out = pattern.sub("[redacted]", out)
    out = re.sub(r"\s+", " ", out).strip()
    if len(out) > MAX_DETAIL_CHARS:
        return out[: MAX_DETAIL_CHARS - 1] + "…"
    return out


def customer_ref(email: str) -> str:
    """Pseudonymous, stable reference for a customer.

    The payload's ``customer`` field must never carry a raw email address. The
    alert endpoint is operated by a third party, and until that endpoint has
    been confirmed in writing (docs/PR-PLAN.md, "Operational alerting" —
    outstanding confirmation), sending addresses there would be an unreviewed
    disclosure of customer data. A keyed digest still lets the receiver see
    that twenty alerts concern one account without learning who that is.
    """
    secret = os.getenv("ALERT_WEBHOOK_SECRET")
    if not secret or not email:
        return ""
    digest = hmac.new(
        secret.encode(), email.strip().lower().encode(), hashlib.sha256
    ).hexdigest()
    return f"c_{digest[:16]}"


def sign_payload(body: str, secret: str) -> str:
    """Return the ``sha256=<hex>`` signature for a serialized body."""
    mac = hmac.new(secret.encode(), body.encode(), hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def build_payload(
    severity: Severity,
    kind: str,
    site: str,
    customer: str,
    detail: str,
    dedupe_key: str,
    occurred_at: str,
) -> dict:
    """Assemble the alert body. Redaction happens here, not at the call site."""
    return {
        "severity": severity,
        "kind": kind,
        "site": redact(site) if site else "",
        "customer": customer,
        "detail": redact(detail) if detail else "",
        "occurred_at": occurred_at,
        "dedupe_key": dedupe_key,
        "source": "backend",
    }


def send_alert_sync(
    severity: Severity,
    kind: str,
    site: str = "",
    customer: str = "",
    detail: str = "",
    dedupe_key: str = "",
) -> bool:
    """Send one alert and wait for the result. Never raises.

    Returns:
        True when the endpoint accepted the alert, False otherwise (including
        when alerting is unconfigured, which is the normal state locally and
        in CI).
    """
    url = os.getenv("ALERT_WEBHOOK_URL")
    secret = os.getenv("ALERT_WEBHOOK_SECRET")
    if not url or not secret:
        return False

    try:
        payload = build_payload(
            severity=severity,
            kind=kind,
            site=site,
            customer=customer,
            detail=detail,
            dedupe_key=dedupe_key or kind,
            occurred_at=datetime.now(timezone.utc).isoformat(),
        )
        body = json.dumps(payload, separators=(",", ":"))
        response = httpx.post(
            url,
            content=body,
            headers={
                "Content-Type": "application/json",
                SIGNATURE_HEADER: sign_payload(body, secret),
                TIMESTAMP_HEADER: str(int(datetime.now(timezone.utc).timestamp())),
            },
            timeout=TIMEOUT_SECONDS,
        )
        if response.status_code >= 400:
            _record_failure(f"endpoint returned {response.status_code} for kind={kind}")
            return False
        return True
    except Exception as exc:  # noqa: BLE001 — an alert must never break a run.
        _record_failure(f"send failed for kind={kind}: {type(exc).__name__}")
        return False


def post_alert(
    severity: Severity,
    kind: str,
    site: str = "",
    customer: str = "",
    detail: str = "",
    dedupe_key: str = "",
) -> None:
    """Fire-and-forget an alert on a daemon thread. Never raises, never blocks.

    Args:
        severity: ``critical`` wakes a human — reserve it for payments broken,
            scanner down, or deep-scan agents erroring. Everything else is
            logged by the receiver.
        kind: Stable machine label for the condition.
        site: Hostname the condition relates to, when there is one.
        customer: Pseudonymous reference from :func:`customer_ref`, never an
            address.
        detail: One line of human context.
        dedupe_key: Stable for the condition so the receiver can suppress
            repeats. It must not contain a timestamp or session id — a key
            that changes on every occurrence defeats suppression and turns a
            flapping check into continuous paging. Defaults to ``kind``.
    """
    if not alerting_configured():
        return

    thread = threading.Thread(
        target=send_alert_sync,
        args=(severity, kind, site, customer, detail, dedupe_key),
        name=f"alert-{kind}",
        daemon=True,
    )
    thread.start()
