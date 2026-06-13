---
doc_type: runbook
framework: incident_response
tags: [port_scan, reconnaissance, network]
control_ids: [DE.CM-1, PR.PT-4, CC7.2]
---

# Port Scan and Network Reconnaissance Runbook

Port scanning indicates an adversary is mapping exposed services before exploitation.

## Immediate actions

1. Identify the scanning source IP and check AbuseIPDB or threat feeds for prior reports.
2. Confirm no follow-up exploitation attempts (HTTP probes, auth failures) from the same host.
3. Reduce attack surface: close unused ports, move admin interfaces behind VPN or bastion.
4. Enable IDS/IPS rules to alert on SYN scans and horizontal port sweeps.

## Detection signals

- Sequential connection attempts across many ports from one IP (Nmap-style).
- SYN packets to closed ports logged by host firewall or VPC flow logs.
- Scanning followed by targeted probes on web or SSH services.

## Remediation

- Apply network segmentation; expose only required services publicly.
- Use cloud-native flow logging (VPC Flow Logs, Azure NSG flow logs).
- Correlate scan events with WAF and load balancer access logs.

## MITRE ATT&CK mapping (curated)

- T1046 Network Service Discovery — adversaries enumerate open ports and services.
- T1595 Active Scanning — external reconnaissance against internet-facing assets.
