"""Tests for the backend SSRF guard and the input hardening added with it.

No test here opens a network connection: DNS answers are injected and HTTP is
served by ``httpx.MockTransport``.
"""

import httpx
import pytest

import main
from agents import vuln_scanner
from tools.docker_scanner import parse_docker_image_ref
from url_guard import BlockedURLError, check_url, guarded_get, is_public_ip


def fixed(*addresses):
    return lambda _host: list(addresses)


# ── Address classification ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.1",
        "172.16.5.4",
        "192.168.0.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "255.255.255.255",
        "::1",
        "::",
        "::ffff:127.0.0.1",
        "::ffff:169.254.169.254",
        "64:ff9b::a9fe:a9fe",
        "2002:a9fe:a9fe::1",
        "fd00::1",
        "fe80::1%eth0",
        "2001:db8::1",
        "not-an-ip",
    ],
)
def test_non_public_addresses_are_refused(address):
    assert not is_public_ip(address)


@pytest.mark.parametrize("address", ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
def test_public_addresses_are_allowed(address):
    assert is_public_ip(address)


# ── URL checks ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/",
        "http://localhost./",
        "http://app.localhost/",
        "http://metadata.google.internal/",
        "http://intranet/",
        "http://2130706433/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]:8000/",
        "file:///etc/passwd",
        "gopher://example.com/",
    ],
)
def test_internal_urls_are_refused(url):
    with pytest.raises(BlockedURLError):
        check_url(url, resolve=fixed("93.184.215.14"))


def test_a_public_name_that_resolves_internally_is_refused():
    with pytest.raises(BlockedURLError):
        check_url("https://rebind.example/", resolve=fixed("127.0.0.1"))
    with pytest.raises(BlockedURLError):
        check_url("https://rebind.example/", resolve=fixed("93.184.215.14", "10.0.0.2"))


def test_a_public_name_with_public_answers_is_allowed():
    check_url("https://example.com/", resolve=fixed("93.184.215.14"))


# ── Redirect hops ──────────────────────────────────────────────────────────


def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)


def test_redirect_to_metadata_is_refused_before_it_is_requested():
    requested = []

    def handler(request):
        requested.append(str(request.url))
        if request.url.host == "public.example":
            return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/"})
        return httpx.Response(200, text="metadata")

    with pytest.raises(BlockedURLError):
        guarded_get(
            "https://public.example/",
            resolve=fixed("93.184.215.14"),
            client=_client(handler),
        )
    assert requested == ["https://public.example/"]


def test_public_redirects_are_followed():
    def handler(request):
        if request.url.path == "/":
            return httpx.Response(301, headers={"location": "/home"})
        return httpx.Response(200, headers={"x-frame-options": "DENY"})

    resp = guarded_get(
        "https://public.example/", resolve=fixed("93.184.215.14"), client=_client(handler)
    )
    assert resp.status_code == 200
    assert resp.headers["x-frame-options"] == "DENY"


def test_redirect_loops_stop():
    def handler(request):
        return httpx.Response(302, headers={"location": "/again"})

    with pytest.raises(BlockedURLError):
        guarded_get(
            "https://public.example/", resolve=fixed("93.184.215.14"), client=_client(handler)
        )


def test_vuln_scanner_header_fetch_refuses_internal_targets(monkeypatch):
    def boom(*_args, **_kwargs):
        raise AssertionError("an internal target must not be fetched")

    monkeypatch.setattr(httpx.Client, "get", boom)
    assert vuln_scanner.fetch_response_headers("http://169.254.169.254/latest/meta-data/") == {}
    assert vuln_scanner.fetch_response_headers("http://localhost:8000/report/x") == {}


# ── Docker image references ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "ref",
    [
        "library/../../users/me",
        "nginx:latest?x=1",
        "nginx:-rf",
        "a/b/c",
        "Nginx",
        "https://hub.docker.com/r/foo/bar/tags/..%2f..",
        "nginx:" + "a" * 200,
    ],
)
def test_malformed_docker_references_are_refused(ref):
    with pytest.raises(ValueError):
        parse_docker_image_ref(ref)


@pytest.mark.parametrize(
    "ref, expected",
    [
        ("nginx", ("library", "nginx", "latest")),
        ("bitnami/nginx:1.25", ("bitnami", "nginx", "1.25")),
        ("docker.io/library/python:3.12-slim", ("library", "python", "3.12-slim")),
        ("https://hub.docker.com/r/grafana/grafana", ("grafana", "grafana", "latest")),
    ],
)
def test_valid_docker_references_still_parse(ref, expected):
    assert parse_docker_image_ref(ref) == expected


# ── Server log exposure ───────────────────────────────────────────────────


def test_system_log_source_is_off_by_default(monkeypatch):
    monkeypatch.delenv("STS_ALLOW_SYSTEM_LOGS", raising=False)

    def boom():
        raise AssertionError("server logs must not be read by default")

    monkeypatch.setattr(main, "_load_system_logs", boom)
    logs, meta = main._load_logs_for_source("system")
    assert logs == main._load_synthetic_logs()
    assert meta["used_fallback"] is True
    assert "disabled" in meta["fallback_reason"]


def test_system_log_source_can_be_enabled_by_the_operator(monkeypatch):
    monkeypatch.setenv("STS_ALLOW_SYSTEM_LOGS", "true")
    monkeypatch.setattr(main, "_load_system_logs", lambda: (["line"], {"used_fallback": False}))
    logs, _meta = main._load_logs_for_source("system")
    assert logs == ["line"]


# ── GitHub repository references (requests carry our GitHub token) ─────────


@pytest.mark.parametrize(
    "ref",
    [
        "octocat/../../user",
        "octocat/Hello-World/../../../user",
        "https://github.com/octocat/..",
        "https://evil.example/octocat/Hello-World",
        "octo cat/Hello-World",
        "octocat/Hello?x=1",
        "octocat/Hello%2F..",
        "-octocat/Hello-World",
    ],
)
def test_malformed_github_references_are_refused(ref):
    from tools.github_scanner import parse_github_url

    with pytest.raises(ValueError):
        parse_github_url(ref)


@pytest.mark.parametrize(
    "ref, expected",
    [
        ("octocat/Hello-World", ("octocat", "Hello-World")),
        ("https://github.com/octocat/Hello-World.git", ("octocat", "Hello-World")),
        ("https://www.github.com/vercel/next.js/tree/canary", ("vercel", "next.js")),
        ("octocat/my.github.io", ("octocat", "my.github.io")),
    ],
)
def test_valid_github_references_still_parse(ref, expected):
    from tools.github_scanner import parse_github_url

    assert parse_github_url(ref) == expected
