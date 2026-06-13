---
doc_type: runbook
framework: incident_response
tags: [sudo_failure, privilege_escalation, authentication]
control_ids: [PR.AC-1, PR.AC-6, CC6.1]
---

# Privilege Escalation and Sudo Failure Runbook

Failed sudo attempts may indicate an insider threat, compromised account, or privilege escalation attempt.

## Immediate actions

1. Identify the user account and source session associated with failed sudo commands.
2. Suspend or lock the account if attempts are unauthorized or anomalous.
3. Audit recent commands run by that user (`auth.log`, `auditd`, EDR).
4. Verify sudoers configuration follows least privilege (no NOPASSWD ALL).

## Detection signals

- Repeated `sudo: authentication failure` for a single user.
- sudo attempts for commands outside the user's normal role.
- sudo from unexpected terminals or after unusual login times.

## Remediation

- Enforce MFA for privileged accounts and break-glass access.
- Use centralized logging and alerting on sudo failures.
- Review and prune sudoers entries quarterly.

## MITRE ATT&CK mapping (curated)

- T1548 Abuse Elevation Control Mechanism — attempts to gain higher privileges via sudo.
- T1078 Valid Accounts — compromised user attempting escalation.
