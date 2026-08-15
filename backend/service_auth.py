"""Service-to-service authentication for the agent backend.

The backend is only ever called by the Next.js proxy at ``/api/agent/*``. That
caller proves its identity with a high-entropy shared secret sent in the
``X-STS-Service-Auth`` header; here we validate it with a constant-time
comparison before any protected endpoint runs.

Design rules:
  * The secret lives exclusively in the ``STS_SERVICE_TOKEN`` environment
    variable. It is never logged, echoed, or included in an error body.
  * Fail closed. If the variable is missing or too weak, protected endpoints
    return 503 — the service refuses to run unauthenticated rather than
    silently serving the world.
  * Only liveness endpoints are exempt, so the platform health check keeps
    working during a deploy.
"""

from __future__ import annotations

import hmac
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

SERVICE_AUTH_HEADER = "x-sts-service-auth"

#: Reject obvious placeholders; a real token is 32+ hex/base64 characters.
MIN_TOKEN_LENGTH = 32

#: Paths that must stay reachable without the shared secret.
EXEMPT_PATHS = frozenset({"/health/trivy", "/health", "/"})


def configured_token() -> str | None:
    """Return the configured service token, or ``None`` when unusable."""
    token = (os.getenv("STS_SERVICE_TOKEN") or "").strip()
    if len(token) < MIN_TOKEN_LENGTH:
        return None
    return token


def is_exempt(path: str) -> bool:
    """True for liveness paths that may be called without authentication."""
    return path.rstrip("/") in {p.rstrip("/") for p in EXEMPT_PATHS} or path == "/"


def token_matches(presented: str | None, expected: str) -> bool:
    """Constant-time comparison that never short-circuits on length."""
    if not presented:
        return False
    return hmac.compare_digest(presented.strip().encode(), expected.encode())


class ServiceAuthMiddleware(BaseHTTPMiddleware):
    """Require a valid shared secret on every non-exempt request."""

    async def dispatch(self, request: Request, call_next):
        if is_exempt(request.url.path):
            return await call_next(request)

        expected = configured_token()
        if expected is None:
            # Fail closed. Do not name the variable's value, only its absence.
            return JSONResponse(
                {"detail": "Service authentication is not configured."},
                status_code=503,
            )

        presented = request.headers.get(SERVICE_AUTH_HEADER)
        if not token_matches(presented, expected):
            return JSONResponse(
                {"detail": "Service authentication required."},
                status_code=401,
            )

        return await call_next(request)
