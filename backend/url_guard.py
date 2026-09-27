"""SSRF guard for URLs the backend fetches on a customer's behalf.

The deep-scan pipeline fetches a customer-supplied ``target_url`` to check its
response headers. That request leaves from our own server, so without a guard
a customer could point it at ``http://169.254.169.254/`` (cloud metadata),
``http://localhost:8000/`` (this API, from the inside) or any private address
on the host's network, directly or through a redirect.

Rule: only http/https, and every address the hostname resolves to must be
ordinary public unicast. Checked before the first request and again on every
redirect hop. Mirrors ``lib/scanner/ipguard.ts`` on the web side.
"""

from __future__ import annotations

import ipaddress
import socket
from typing import Callable
from urllib.parse import urljoin, urlparse

import httpx

Resolver = Callable[[str], list[str]]

MAX_REDIRECTS = 5
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa")

# Ranges Python's is_global does not already exclude, or that we name explicitly
# so the intent survives a change in the standard library's tables.
_EXTRA_BLOCKED = [
    ipaddress.ip_network("100.64.0.0/10"),  # carrier-grade NAT
    ipaddress.ip_network("64:ff9b::/96"),  # NAT64, checked via the embedded v4
]


class BlockedURLError(ValueError):
    """Raised when a URL points at an internal or non-public destination."""


def _system_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    return [info[4][0] for info in infos]


def is_public_ip(address: str) -> bool:
    """True only for ordinary public unicast addresses."""
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        embedded = ip.ipv4_mapped or ip.sixtofour
        if embedded is None and ip in _EXTRA_BLOCKED[1]:
            embedded = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
        if embedded is not None:
            return is_public_ip(str(embedded))
        if ip.teredo is not None:
            return False
    if any(ip in net for net in _EXTRA_BLOCKED if net.version == ip.version):
        return False
    return ip.is_global and not ip.is_multicast


def check_url(url: str, resolve: Resolver | None = None) -> None:
    """Raise :class:`BlockedURLError` unless ``url`` may be fetched."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise BlockedURLError("Only http and https URLs can be scanned")
    host = (parsed.hostname or "").rstrip(".").lower()
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
        if not is_public_ip(address):
            raise BlockedURLError("Internal and private addresses cannot be scanned")


def guarded_get(
    url: str,
    *,
    timeout: float = 15,
    resolve: Resolver | None = None,
    client: httpx.Client | None = None,
) -> httpx.Response:
    """GET ``url``, following redirects manually and checking every hop."""
    own_client = client is None
    http = client or httpx.Client(follow_redirects=False, timeout=timeout)
    try:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            check_url(current, resolve)
            resp = http.get(current, follow_redirects=False)
            location = resp.headers.get("location")
            if resp.is_redirect and location:
                current = urljoin(current, location)
                continue
            return resp
        raise BlockedURLError("Too many redirects")
    finally:
        if own_client:
            http.close()
