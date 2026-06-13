---
doc_type: nist
framework: NIST CSF 2.0
tags: [identity, access, authentication, brute_force]
control_ids: [PR.AC-1, PR.AC-4, PR.AC-6, DE.CM-1]
---

# NIST CSF 2.0 — Identity and Access Controls

## PR.AC-1 Identities and credentials are managed

Organizations must issue, manage, verify, and revoke identities and credentials for authorized users, services, and hardware. Failed authentication spikes indicate gaps in credential lifecycle management or missing lockout policies.

**Remediation guidance:** Implement account lockout after repeated failures, enforce MFA for remote access, and centralize identity in IdP (Okta, Azure AD, Google Workspace).

## PR.AC-4 Access permissions are managed

Access to assets is limited to authorized users, processes, and devices. Path traversal and unauthorized file access suggest insufficient authorization checks on application resources.

**Remediation guidance:** Apply role-based access control (RBAC), validate authorization on every request, and audit permission changes.

## PR.AC-6 Identities are proofed and bound to credentials

Proofing ensures identities are verified before credentials are issued. Weak or shared credentials increase brute-force success rates.

**Remediation guidance:** Disable default accounts, require strong password policies or passwordless auth, and monitor for credential stuffing.

## DE.CM-1 Networks and network services are monitored

Continuous monitoring detects anomalous traffic including port scans and brute-force patterns.

**Remediation guidance:** Deploy SIEM correlation rules, enable VPC flow logs, and integrate WAF alerts with incident response workflows.
