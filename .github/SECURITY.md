# Security Policy

## Supported versions

Secure Total Scan is under active development. Security fixes are applied to the latest release on the default branch (`master`).

| Version | Supported |
| ------- | --------- |
| latest on `master` | yes |
| older commits / forks | no |

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

If you believe you have found a security issue in Secure Total Scan (web app, API, agents, or infrastructure), report it privately:

- **Email:** [security@securetotalscan.com](mailto:security@securetotalscan.com)
- **Security.txt:** [https://securetotalscan.com/.well-known/security.txt](https://securetotalscan.com/.well-known/security.txt)

Include as much detail as possible:

- Description of the issue and potential impact
- Steps to reproduce (proof of concept if available)
- Affected URLs, endpoints, or components
- Your contact information for follow-up

We aim to acknowledge reports within **3 business days** and will keep you informed as we investigate.

## Scope

In scope:

- The Secure Total Scan web application and public API
- Authentication, authorization, and session handling
- Injection, SSRF, or unsafe handling of user-supplied targets (URLs, Docker image names, etc.)
- Dependency and container image vulnerabilities in this repository
- Misconfiguration that exposes secrets or customer data

Out of scope:

- Denial-of-service against production without prior coordination
- Social engineering or physical attacks
- Issues in third-party services (Vercel, Railway, GitHub, Docker Hub) unless introduced by our configuration
- Vulnerabilities in targets you scan using the product without authorization

## Safe harbor

We support good-faith security research. Do not access data that is not yours, and do not degrade service for other users. We will not pursue legal action against researchers who follow this policy.

## Automated scanning

This repository runs GitHub security checks on pull requests and the default branch, including:

- **CodeQL** static analysis (JavaScript/TypeScript and Python)
- **Dependency Review** on pull requests (public repos, or private repos with GitHub Advanced Security)
- **npm audit** and **pip-audit** for known CVEs in dependencies
- **Dependabot** alerts and security update pull requests

See [`.github/workflows/`](workflows/) for workflow definitions.

Repository maintainers should also confirm under **Settings → Code security and analysis** that Dependabot alerts and dependency graph are enabled.

## Disclosure

When a fix is available, we will publish a security advisory or release notes as appropriate and credit reporters who wish to be acknowledged.
