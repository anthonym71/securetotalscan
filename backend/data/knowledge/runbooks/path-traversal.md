---
doc_type: runbook
framework: incident_response
tags: [path_traversal, web, nginx]
control_ids: [PR.AC-4, PR.DS-5, CC6.1]
---

# Path Traversal and Directory Traversal Runbook

Path traversal attempts exploit insufficient input validation to read files outside the web root (e.g. `/etc/passwd`, application secrets).

## Immediate actions

1. Block the source IP at the WAF or reverse proxy.
2. Review web server access logs for successful `200` responses on traversal payloads.
3. Patch or reconfigure the affected application to reject `../` sequences and encoded variants.
4. Rotate secrets if sensitive files may have been read.

## Detection signals

- Requests containing `../`, `%2e%2e`, `..%2f`, or `/etc/passwd` in URL paths.
- Unusual 404/403 spikes on static asset paths.
- nginx or Apache logs showing traversal patterns against API routes.

## Remediation

- Normalize and validate all file path inputs server-side.
- Run web apps with least-privilege OS users; disable directory listing.
- Deploy a WAF with OWASP CRS rules for path traversal.

## MITRE ATT&CK mapping (curated)

- T1083 File and Directory Discovery — reading sensitive paths via traversal.
- T1190 Exploit Public-Facing Application — web app vulnerability exploitation.
