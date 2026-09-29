"""SSRF guard for URLs the backend fetches on a customer's behalf.

The deep-scan pipeline fetches a customer-supplied ``target_url`` to check its
response headers. That request leaves from our own server, so without a guard
a customer could point it at ``http://169.254.169.254/`` (cloud metadata),
``http://localhost:8000/`` (this API, from the inside) or any private address
on the host's network, directly or through a redirect.

Rule: only http/https, and every address the hostname resolves to must be
ordinary public unicast. Checked before the first request and again on every
redirect hop. Mirrors ``lib/scanner/ipguard.ts`` on the web side.

Checking is not enough on its own. If httpx resolved the name again to
connect, a zero-TTL DNS answer could change between the check and the
connection (DNS rebinding). So the connection is pinned: ``PinnedBackend``
is the network layer under httpx, and it opens sockets only to the addresses
that were checked, re-checking them as it does. The URL is not rewritten, so
the Host header, TLS SNI and certificate validation use the real hostname.

Also: a lookup error or an empty answer refuses the request (fail closed),
proxies and ``.netrc`` are ignored (``trust_env=False``), bodies are read
with a byte cap, and the whole fetch, redirects included, has one deadline.
"""

from __future__ import annotations

import ipaddress
import socket
import time
import typing
from typing import Callable
from urllib.parse import urljoin, urlparse

import httpcore
import httpx

Resolver = Callable[[str], list[str]]

MAX_REDIRECTS = 5
MAX_BODY_BYTES = 64 * 1024
DEADLINE_SECONDS = 20.0
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa")

# Ranges Python's is_global does not already exclude, or that we name explicitly
# so the intent survives a change in the standard library's tables. Keep in
# step with lib/scanner/ipguard.ts.
_NAT64 = ipaddress.ip_network("64:ff9b::/96")  # checked via the embedded v4
_IPV4_COMPATIBLE = ipaddress.ip_network("::/96")  # deprecated ::a.b.c.d
_EXTRA_BLOCKED = [
    ipaddress.ip_network("100.64.0.0/10"),  # carrier-grade NAT
    ipaddress.ip_network("::ffff:0:0:0/96"),  # IPv4-translated ::ffff:0:a.b.c.d (RFC 2765)
    ipaddress.ip_network("64:ff9b:1::/48"),  # local-use NAT64 (RFC 8215)
    ipaddress.ip_network("3fff::/20"),  # documentation (RFC 9637)
    ipaddress.ip_network("2001::/23"),  # IETF special-purpose, incl. Teredo, ORCHID
    ipaddress.ip_network("2001:db8::/32"),  # documentation
]


class BlockedURLError(ValueError):
    """Raised when a URL points at an internal or non-public destination."""


def _system_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    return [info[4][0] for info in infos]


def _is_loopback(address: str) -> bool:
    try:
        return ipaddress.ip_address(address.split("%", 1)[0]).is_loopback
    except ValueError:
        return False


def is_public_ip(address: str) -> bool:
    """True only for ordinary public unicast addresses."""
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        embedded = ip.ipv4_mapped or ip.sixtofour
        if embedded is None and (ip in _NAT64 or ip in _IPV4_COMPATIBLE):
            embedded = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
        if embedded is not None:
            return is_public_ip(str(embedded))
        if ip.teredo is not None:
            return False
    if any(ip in net for net in _EXTRA_BLOCKED if net.version == ip.version):
        return False
    return ip.is_global and not ip.is_multicast


def _allowed(address: str, allow_loopback: bool) -> bool:
    return is_public_ip(address) or (allow_loopback and _is_loopback(address))


def _normalize_host(host: str) -> str:
    return host.strip("[]").rstrip(".").lower()


def resolve_url(
    url: str, resolve: Resolver | None = None, *, allow_loopback: bool = False
) -> tuple[str, list[str]]:
    """Resolve ``url``'s host once and check it.

    Returns ``(host, addresses)``: the complete checked set that the
    connection must be pinned to. Raises :class:`BlockedURLError` otherwise,
    including when the name does not resolve (fail closed).

    ``allow_loopback`` exists for tests that need a local server. No caller in
    the application sets it.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise BlockedURLError("Only http and https URLs can be scanned")
    host = _normalize_host(parsed.hostname or "")
    if not host:
        raise BlockedURLError("URL has no host")
    bare_name = "." not in host and ":" not in host
    if host == "localhost" or host.endswith(BLOCKED_SUFFIXES) or bare_name:
        raise BlockedURLError("Internal hostnames cannot be scanned")

    try:
        ipaddress.ip_address(host)
        addresses = [host]
    except ValueError:
        try:
            addresses = (resolve or _system_resolver)(host)
        except (OSError, UnicodeError) as exc:
            raise BlockedURLError(f"Could not resolve {host}") from exc
        if not addresses:
            raise BlockedURLError(f"Could not resolve {host}")

    for address in addresses:
        if not _allowed(address, allow_loopback):
            raise BlockedURLError("Internal and private addresses cannot be scanned")
    return host, list(addresses)


def check_url(url: str, resolve: Resolver | None = None) -> None:
    """Raise :class:`BlockedURLError` unless ``url`` may be fetched."""
    resolve_url(url, resolve)


class PinnedBackend(httpcore.NetworkBackend):
    """httpcore network layer that connects only to checked addresses.

    ``pins`` maps a hostname to the addresses that were checked for it. A
    connection to any other host, or to an address that fails the policy on
    re-check, is refused before a socket is opened. DNS is never consulted
    here: the host is swapped for a pinned IP only at ``connect_tcp``, so TLS
    still uses the original hostname for SNI and certificate checks.
    """

    def __init__(self, allow_loopback: bool = False) -> None:
        self.pins: dict[str, list[str]] = {}
        self.allow_loopback = allow_loopback
        self.connected: list[str] = []
        self._inner = httpcore.SyncBackend()

    def pin(self, host: str, addresses: list[str]) -> None:
        self.pins[_normalize_host(host)] = list(addresses)

    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: typing.Iterable[typing.Any] | None = None,
    ) -> httpcore.NetworkStream:
        addresses = self.pins.get(_normalize_host(host))
        if not addresses:
            raise httpcore.ConnectError(f"{host} was not checked")
        vetted = [a for a in addresses if _allowed(a, self.allow_loopback)]
        if not vetted:
            raise httpcore.ConnectError("Internal and private addresses cannot be scanned")
        last: Exception | None = None
        for address in vetted:
            try:
                stream = self._inner.connect_tcp(
                    address.split("%", 1)[0],
                    port,
                    timeout=timeout,
                    local_address=local_address,
                    socket_options=socket_options,
                )
                self.connected.append(address)
                return stream
            except httpcore.ConnectError as exc:
                last = exc
        raise last or httpcore.ConnectError(f"Could not connect to {host}")

    def connect_unix_socket(self, *args, **kwargs):  # pragma: no cover
        raise httpcore.ConnectError("Unix sockets are not allowed")

    def sleep(self, seconds: float) -> None:  # pragma: no cover
        self._inner.sleep(seconds)


def pinned_client(backend: PinnedBackend, timeout: float) -> httpx.Client:
    """An httpx client whose every connection goes through ``backend``."""
    transport = httpx.HTTPTransport(trust_env=False)
    # httpx builds its own httpcore pool with the default network backend.
    # Replace it with one that uses the pinned backend. Guarded by
    # tests/test_url_guard.py, which fails if this stops taking effect.
    transport._pool = httpcore.ConnectionPool(
        ssl_context=httpx.create_ssl_context(trust_env=False),
        network_backend=backend,
    )
    return httpx.Client(
        transport=transport, trust_env=False, follow_redirects=False, timeout=timeout
    )


def guarded_get(
    url: str,
    *,
    timeout: float = 15,
    resolve: Resolver | None = None,
    client: httpx.Client | None = None,
    max_bytes: int = MAX_BODY_BYTES,
    deadline: float = DEADLINE_SECONDS,
    allow_loopback: bool = False,
) -> httpx.Response:
    """GET ``url`` with redirects followed manually and every hop checked.

    Each hop is resolved once and its connection pinned to the checked
    addresses. The body is streamed and cut at ``max_bytes``, and the whole
    call, redirects included, must finish within ``deadline`` seconds.

    ``client`` is for tests that replace the network with a mock transport;
    such a client bypasses the pinned backend.
    """
    started = time.monotonic()

    def remaining() -> float:
        left = deadline - (time.monotonic() - started)
        if left <= 0:
            raise BlockedURLError("Fetch deadline exceeded")
        return left

    backend = PinnedBackend(allow_loopback=allow_loopback)
    own_client = client is None
    http = client or pinned_client(backend, timeout)
    try:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            host, addresses = resolve_url(current, resolve, allow_loopback=allow_loopback)
            backend.pin(host, addresses)
            per_request = httpx.Timeout(min(timeout, remaining()))
            with http.stream("GET", current, follow_redirects=False, timeout=per_request) as resp:
                location = resp.headers.get("location")
                if resp.is_redirect and location:
                    current = urljoin(current, location)
                    continue
                body = bytearray()
                if resp.is_stream_consumed:  # a mock transport hands over read content
                    body.extend(resp.content[:max_bytes])
                else:
                    for chunk in resp.iter_raw():
                        body.extend(chunk[: max_bytes - len(body)])
                        if len(body) >= max_bytes:
                            break
                        remaining()
                return httpx.Response(
                    resp.status_code,
                    headers=resp.headers,
                    content=bytes(body),
                    request=resp.request,
                )
        raise BlockedURLError("Too many redirects")
    finally:
        if own_client:
            http.close()
