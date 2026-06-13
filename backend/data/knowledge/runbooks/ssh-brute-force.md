---
doc_type: runbook
framework: incident_response
tags: [brute_force, ssh, authentication]
control_ids: [PR.AC-1, DE.CM-1, CC6.1]
---

# SSH Brute Force Response Runbook

When repeated failed SSH authentication attempts are detected from one or more source IPs, treat this as an active credential-stuffing or password-spray attack.

## Immediate actions

1. Block offending IPs at the firewall or cloud WAF (AWS Security Group, GCP firewall rule, or iptables).
2. Enable fail2ban or equivalent rate limiting on sshd if not already active.
3. Verify no successful logins occurred from the same IPs in the last 24 hours.
4. Rotate credentials for any account that may have been targeted.

## Detection signals

- Multiple `Failed password` or `Invalid user` entries from the same source IP within minutes.
- Geographic anomalies (logins from unexpected countries).
- Attempts against common usernames: root, admin, ubuntu, deploy.

## Remediation

- Disable password authentication; use SSH keys only.
- Enforce MFA for bastion or console access.
- Review `/var/log/auth.log` and central SIEM for lateral movement.

## MITRE ATT&CK mapping (curated)

- T1110 Brute Force — adversaries attempt to gain access via repeated login attempts.
- T1078 Valid Accounts — successful brute force yields legitimate credentials.
