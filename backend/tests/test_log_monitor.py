"""Tests for log line parsing and Log Monitor agent."""

from tools.log_parser import detect_anomalies, parse_log_line
from agents.log_monitor import run_log_monitor
from state import make_initial_state


def test_parse_log_line_ssh_failure():
    line = "Jun 12 10:00:01 server sshd[1234]: Failed password for root from 192.168.1.42 port 4444 ssh2"
    result = parse_log_line(line)
    assert result["type"] == "ssh_failure"
    assert result["source_ip"] == "192.168.1.42"
    assert result["user"] == "root"


def test_parse_log_line_port_scan():
    line = "Jun 12 10:01:00 server kernel: Nmap scan detected from 10.0.0.5"
    result = parse_log_line(line)
    assert result["type"] == "port_scan"
    assert result["source_ip"] == "10.0.0.5"


def test_detect_anomalies_brute_force():
    events = [
        {"type": "ssh_failure", "source_ip": "192.168.1.42", "user": "root"},
        {"type": "ssh_failure", "source_ip": "192.168.1.42", "user": "admin"},
        {"type": "ssh_failure", "source_ip": "192.168.1.42", "user": "ubuntu"},
    ]
    anomalies = detect_anomalies(events)
    brute = next(a for a in anomalies if a["type"] == "brute_force")
    assert brute["source_ip"] == "192.168.1.42"
    assert brute["title"] == "SSH Brute Force Attack"
    assert "firewall" in brute["recommendation"].lower()


def test_run_log_monitor_populates_state():
    state = make_initial_state(
        raw_logs=[
            "Jun 12 10:00:01 server sshd[1234]: Failed password for root from 192.168.1.42 port 4444 ssh2",
            "Jun 12 10:00:02 server sshd[1234]: Failed password for root from 192.168.1.42 port 4444 ssh2",
            "Jun 12 10:00:03 server sshd[1234]: Failed password for root from 192.168.1.42 port 4444 ssh2",
        ],
        log_source="synthetic",
        session_id="test-001",
    )
    result = run_log_monitor(state)
    assert len(result["anomalies"]) > 0
    assert len(result["severity_map"]) > 0
