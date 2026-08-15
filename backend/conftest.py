"""Shared pytest setup.

Every protected endpoint now requires the service-auth shared secret, so the
test suite provides one and attaches it to every ``TestClient`` by default.
Tests that exercise the auth boundary itself pass explicit headers, which
override this default.
"""

import os

from starlette.testclient import TestClient

TEST_SERVICE_TOKEN = "test-service-token-0123456789abcdefghij"

os.environ.setdefault("STS_SERVICE_TOKEN", TEST_SERVICE_TOKEN)

_original_init = TestClient.__init__


def _init_with_service_auth(self, *args, **kwargs):
    _original_init(self, *args, **kwargs)
    self.headers.update({"x-sts-service-auth": os.environ["STS_SERVICE_TOKEN"]})


TestClient.__init__ = _init_with_service_auth
