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
        "::127.0.0.1",
        "::a9fe:a9fe",
        "::ffff:0:7f00:1",
        "::ffff:0:808:808",
        "64:ff9b:1::a9fe:a9fe",
        "64:ff9b:1:ffff::1",
        "3fff::1",
        "3fff:fff::1",
        "2001:10::1",
        "2001:20::1",
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
    monkeypatch.setattr(httpx.Client, "stream", boom)
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


# ── Round 2 of the review: fail closed, pinning, proxies, caps ────────────

import http.server  # noqa: E402
import threading  # noqa: E402
import time  # noqa: E402

import httpcore  # noqa: E402

from url_guard import PinnedBackend, pinned_client, resolve_url  # noqa: E402


def test_a_resolver_error_refuses_the_request():
    def broken(_host):
        raise socket_error()

    with pytest.raises(BlockedURLError):
        check_url("https://site.example/", resolve=broken)


def socket_error():
    import socket

    return socket.gaierror(-2, "Name or service not known")


def test_an_empty_dns_answer_refuses_the_request():
    with pytest.raises(BlockedURLError):
        check_url("https://site.example/", resolve=fixed())


def test_nat64_of_a_public_address_is_still_public():
    assert is_public_ip("64:ff9b::808:808")


class _Handler(http.server.BaseHTTPRequestHandler):
    hits = 0

    def log_message(self, *_args):
        pass

    def do_GET(self):
        type(self).hits += 1
        if self.path == "/big":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            for _ in range(64):
                self.wfile.write(b"x" * 16384)
            return
        if self.path == "/drip":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            for _ in range(20):
                try:
                    self.wfile.write(b"x")
                    self.wfile.flush()
                except OSError:
                    return
                time.sleep(0.25)
            return
        body = f"host={self.headers.get('Host')}".encode()
        self.send_response(200)
        self.send_header("X-Internal", "yes")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture()
def loopback_server():
    _Handler.hits = 0
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.handle_error = lambda *_args: None  # client hang-ups are expected here
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server.server_address[1]
    server.shutdown()
    server.server_close()


def sequence(*answers):
    calls = {"n": 0}

    def resolver(_host):
        calls["n"] += 1
        return list(answers[min(calls["n"] - 1, len(answers) - 1)])

    resolver.calls = calls
    return resolver


def test_connection_uses_the_checked_answer_not_a_later_one(loopback_server):
    port = loopback_server
    resolver = sequence(["127.0.0.1"], ["127.0.0.2"])
    resp = guarded_get(
        f"http://rebind.test:{port}/", resolve=resolver, allow_loopback=True, timeout=5
    )
    assert resp.status_code == 200
    assert resolver.calls["n"] == 1  # DNS asked once; the connection reused the pin
    assert resp.text == f"host=rebind.test:{port}"  # Host header is the real name


def test_a_rebound_second_answer_never_reaches_the_server(loopback_server):
    port = loopback_server
    resolver = sequence(["127.0.0.2"], ["127.0.0.1"])
    with pytest.raises(httpx.ConnectError):
        guarded_get(
            f"http://rebind.test:{port}/", resolve=resolver, allow_loopback=True, timeout=5
        )
    assert _Handler.hits == 0
    assert resolver.calls["n"] == 1


def test_a_name_answering_loopback_is_refused_by_default(loopback_server):
    port = loopback_server
    with pytest.raises(BlockedURLError):
        guarded_get(f"http://rebind.test:{port}/", resolve=fixed("127.0.0.1"))
    assert _Handler.hits == 0


def test_the_pinned_backend_re_checks_and_refuses_loopback():
    backend = PinnedBackend(allow_loopback=False)
    backend.pin("site.example", ["127.0.0.1"])
    with pytest.raises(httpcore.ConnectError):
        backend.connect_tcp("site.example", 80, timeout=1)
    assert backend.connected == []


def test_the_pinned_backend_refuses_unchecked_hosts():
    backend = PinnedBackend(allow_loopback=True)
    backend.pin("site.example", ["127.0.0.1"])
    with pytest.raises(httpcore.ConnectError):
        backend.connect_tcp("other.example", 80, timeout=1)


def test_the_pinned_client_really_uses_the_pinned_backend(loopback_server):
    """Fails if an httpx upgrade stops the transport swap from taking effect."""
    backend = PinnedBackend(allow_loopback=True)  # nothing pinned
    with pinned_client(backend, timeout=5) as client:
        with pytest.raises(httpx.ConnectError):
            client.get(f"http://127.0.0.1:{loopback_server}/")
    assert _Handler.hits == 0


def test_proxy_environment_is_ignored(loopback_server, monkeypatch):
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9")
    monkeypatch.setenv("ALL_PROXY", "http://127.0.0.1:9")
    backend = PinnedBackend()
    with pinned_client(backend, timeout=5) as client:
        assert client._trust_env is False
    resp = guarded_get(
        f"http://rebind.test:{loopback_server}/",
        resolve=fixed("127.0.0.1"),
        allow_loopback=True,
        timeout=5,
    )
    assert resp.status_code == 200


def test_the_body_is_capped(loopback_server):
    resp = guarded_get(
        f"http://rebind.test:{loopback_server}/big",
        resolve=fixed("127.0.0.1"),
        allow_loopback=True,
        max_bytes=4096,
        timeout=5,
    )
    assert resp.status_code == 200
    assert len(resp.content) == 4096


def test_a_slow_drip_body_hits_the_overall_deadline(loopback_server):
    started = time.monotonic()
    with pytest.raises((BlockedURLError, httpx.TimeoutException)):
        guarded_get(
            f"http://rebind.test:{loopback_server}/drip",
            resolve=fixed("127.0.0.1"),
            allow_loopback=True,
            deadline=1.0,
            timeout=5,
        )
    assert time.monotonic() - started < 3


def test_resolve_url_returns_the_full_checked_set():
    host, addresses = resolve_url(
        "https://Site.Example./", resolve=fixed("93.184.215.14", "2606:2800:21f:cb07::1")
    )
    assert host == "site.example"
    assert addresses == ["93.184.215.14", "2606:2800:21f:cb07::1"]


# ── R7: names from the scanned repo are encoded; R8: no trailing newline ──


def _recording_client(seen):
    def handler(request):
        seen.append(request.url)
        if "/git/trees/" in request.url.path:
            return httpx.Response(200, json={"tree": []})
        return httpx.Response(200, json={"content": "", "encoding": "base64"})

    return httpx.Client(
        transport=httpx.MockTransport(handler), base_url="https://api.github.com"
    )


def test_file_paths_cannot_add_a_query_or_fragment():
    from tools import github_scanner

    seen = []
    with _recording_client(seen) as client:
        github_scanner.fetch_file_content(client, "octo", "repo", "src/a?ref=evil#x%2e.py")
    url = seen[0]
    assert url.query == b""
    assert url.fragment == ""
    assert url.raw_path.startswith(b"/repos/octo/repo/contents/src/a%3Fref%3Devil%23x%252e.py")


def test_branch_names_cannot_add_a_query():
    from tools import github_scanner

    seen = []
    with _recording_client(seen) as client:
        github_scanner.list_scannable_files(client, "octo", "repo", "main?x=1#y")
    assert seen[0].raw_path == b"/repos/octo/repo/git/trees/main%3Fx%3D1%23y?recursive=1"


@pytest.mark.parametrize("value", ["../../user", "a/../b", "", "bad\nname"])
def test_traversal_or_control_characters_in_repo_names_are_refused(value):
    from tools import github_scanner

    with pytest.raises(ValueError):
        github_scanner._quote_path(value)
    with pytest.raises(ValueError):
        github_scanner._quote_ref(value)


@pytest.mark.parametrize("ref", ["own\n/repo", "octocat/repo\n.git"])
def test_a_trailing_newline_is_refused_in_github_names(ref):
    from tools.github_scanner import parse_github_url

    with pytest.raises(ValueError):
        parse_github_url(ref)


@pytest.mark.parametrize("ref", ["nginx\n:latest", "library/nginx:1.25\n"])
def test_a_trailing_newline_is_refused_in_docker_names(ref):
    from tools.docker_scanner import _validate_image_parts

    ns, _, rest = ref.partition("/") if "/" in ref else ("library", "", ref)
    repo, _, tag = rest.partition(":")
    with pytest.raises(ValueError):
        _validate_image_parts(ns, repo, tag)
