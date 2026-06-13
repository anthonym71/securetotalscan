---
doc_type: soc2
framework: SOC 2 Type II
tags: [access, monitoring, logical_security]
control_ids: [CC6.1, CC6.2, CC6.3, CC6.6, CC7.2]
---

# SOC 2 Type II — Logical Access and Monitoring

## CC6.1 Logical access security

Logical access to systems must be restricted to authorized personnel. SSH brute force and sudo failures are indicators that logical access controls may be insufficient or under attack.

**Auditor expectations:** Document access provisioning/deprovisioning procedures, evidence of periodic access reviews, and alerts on authentication anomalies.

## CC6.2 Prior to issuing credentials

Credentials are issued only after identity verification. Automated attacks often target default or weak accounts created without proper onboarding.

**Remediation:** Remove default credentials, enforce joiner/mover/leaver processes, and log all credential issuance events.

## CC6.3 Access removed when no longer needed

Timely deprovisioning prevents former users or compromised accounts from retaining access. Persistent failed login attempts against stale usernames may indicate orphaned accounts.

## CC6.6 Unauthorized access prevented

Controls must prevent unauthorized access to assets. Network reconnaissance and path traversal are precursors to unauthorized data access.

## CC7.2 System components monitored

Infrastructure and applications are monitored for anomalies. Port scans, auth failures, and traversal attempts should trigger alerts and incident tickets with retention for audit.
