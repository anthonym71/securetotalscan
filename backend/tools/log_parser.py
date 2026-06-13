"""Log parsing and anomaly detection for SSH, nginx, and sudo events."""

import re
from collections import defaultdict

SSH_FAIL_RE = re.compile(r"Failed password for (\S+) from ([\d.]+)")
PORT_SCAN_RE = re.compile(r"Nmap scan detected from ([\d.]+)")
PATH_TRAVERSE_RE = re.compile(r"(\d{3}) (/etc/\S+|/proc/\S+|\.\./) HTTP")
SUDO_FAIL_RE = re.compile(r"FAILED su for user (\S+) by (\S+)")
NGINX_IP_RE = re.compile(r"from ([\d.]+)\s*$")

ANOMALY_META: dict[str, dict[str, str]] = {
    "brute_force": {
        "title": "SSH Brute Force Attack",
        "recommendation": (
            "Block the attacking IP at the firewall, enable fail2ban or equivalent "
            "rate limiting, disable root SSH login, and require key-based authentication"
        ),
    },
    "port_scan": {
        "title": "Network Port Scan",
        "recommendation": (
            "Block or rate-limit the scanner IP, tighten firewall rules, and alert "
            "on reconnaissance activity in your SIEM"
        ),
    },
    "path_traversal": {
        "title": "Path Traversal Attempt",
        "recommendation": (
            "Patch input validation in the web application, restrict sensitive paths "
            "in nginx/Apache, and add WAF rules for directory traversal patterns"
        ),
    },
    "sudo_failure": {
        "title": "Privilege Escalation Attempt",
        "recommendation": (
            "Audit sudoers configuration, remove unnecessary privileges from service "
            "accounts, and investigate lateral movement from the source host"
        ),
    },
}


def _enrich_anomaly(anomaly: dict) -> dict:
    """Attach human-readable title and remediation text to an anomaly dict."""
    meta = ANOMALY_META.get(anomaly["type"], {})
    return {
        **anomaly,
        "title": meta.get("title", anomaly["type"].replace("_", " ").title()),
        "recommendation": meta.get(
            "recommendation", "Investigate this event and apply standard incident response procedures"
        ),
    }


def parse_log_line(line: str) -> dict:
    """Parse a single log line into a structured event dict.

    Args:
        line: Raw log line from syslog, auth.log, or similar sources.

    Returns:
        Event with ``type`` and type-specific fields, or ``info`` if unmatched.
    """
    if m := SSH_FAIL_RE.search(line):
        return {
            "type": "ssh_failure",
            "user": m.group(1),
            "source_ip": m.group(2),
            "raw": line,
        }
    if m := PORT_SCAN_RE.search(line):
        return {"type": "port_scan", "source_ip": m.group(1), "raw": line}
    if m := PATH_TRAVERSE_RE.search(line):
        source_ip = "unknown"
        if ip_match := NGINX_IP_RE.search(line):
            source_ip = ip_match.group(1)
        return {
            "type": "path_traversal",
            "path": m.group(2),
            "source_ip": source_ip,
            "raw": line,
        }
    if m := SUDO_FAIL_RE.search(line):
        return {"type": "sudo_failure", "user": m.group(1), "by": m.group(2), "raw": line}
    return {"type": "info", "raw": line}


def detect_anomalies(events: list[dict]) -> list[dict]:
    """Aggregate parsed events into security anomalies with severity and remediation.

    SSH failures from the same IP (≥3) are escalated to ``brute_force`` CRITICAL.

    Args:
        events: Output of :func:`parse_log_line` for each log line.

    Returns:
        List of enriched anomaly dicts ready for downstream agents.
    """
    anomalies = []
    ip_failures: dict[str, int] = defaultdict(int)

    for e in events:
        if e["type"] == "ssh_failure":
            ip_failures[e["source_ip"]] += 1
        elif e["type"] in ("port_scan", "path_traversal", "sudo_failure"):
            anomalies.append(
                _enrich_anomaly(
                    {
                        "type": e["type"],
                        "source_ip": e.get("source_ip", "unknown"),
                        "detail": e.get("path") or e.get("by") or "",
                        "severity": "HIGH",
                    }
                )
            )

    for ip, count in ip_failures.items():
        if count >= 3:
            anomalies.append(
                _enrich_anomaly(
                    {
                        "type": "brute_force",
                        "source_ip": ip,
                        "attempt_count": count,
                        "severity": "CRITICAL",
                    }
                )
            )

    return anomalies
