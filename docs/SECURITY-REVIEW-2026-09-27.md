# Self-security review: 2026-09-27

Scope: this repository (`anthonym71/securetotalscan`, public), all branches and full history, at `master` `3d3e030` plus branch `fix/make-it-work-2026-09-27`. A security product in a public repo has to pass its own scan.

## 1. Secrets in git history

**Tools.** gitleaks v8.24.3 over every commit on every branch (the new `Secret Scan` workflow, 124 commits), plus a local pattern scan of `git log --all -p` (156 commits: AWS, GitHub, OpenAI, Anthropic, Slack, Google, Stripe, private keys, JWTs, Postgres/Redis URLs, generic key assignments). Values were never printed. Only locations were recorded.

| Location | Rule | Verdict |
| --- | --- | --- |
| `app/dashboard/page.tsx:53`, commit `de06dde` (2026-06-14), removed in `706453f` (2026-08-15) | Slack incoming webhook URL (`DEFAULT_SLACK_WEBHOOK_URL`) | **Real-shaped. Treat as compromised, rotate.** It was also served to every visitor in the dashboard JS bundle while it was live. Still reachable in history on `master` and 30+ other branches. |
| `backend/tests/test_alerting.py:134`, `scripts/verify-alerting.ts:140,144` (commits `75c780a`, `e8490ef`) | `stripe-access-token` | Test fixture. A 12-character made-up `sk_live_` string used to prove the alert redactor works. Real keys are much longer. Listed in `.gitleaksignore`. |
| `scripts/verify-scanner.ts` (`d95c5d5`) | AWS key, OpenAI key shapes | Test fixtures. AWS's own documentation example key, and an obviously sequential fake. gitleaks does not flag them. |
| `.env.example` (`d95c5d5`) | Upstash token name | Placeholder values only. |
| `backend/conftest.py` (`147d439`) | Generic assignment | A `test-` prefixed service token for pytest. |

The older private repo `anthonym71/secure-total-scan` (5 commits) has only the same AWS documentation example and fake OpenAI string. No findings.

**What to do about the webhook.** Revoke it in the Slack app's Incoming Webhooks settings (it cannot be un-leaked by editing git). Check the channel for spam or phishing posts since June. Then add its fingerprint to `.gitleaksignore` with the revocation date, and the `Secret Scan` check goes green. Rewriting history is not recommended: the repo is public and forked copies already hold it, and it would need a force push.

## 2. Dependencies

| Ecosystem | Before | After |
| --- | --- | --- |
| npm | 1 critical (Next.js RCE: GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4), 2 high (sharp/libheif GHSA-rgj7-g3m4-5g8c, js-yaml GHSA-2883-xcg3-v3hh) | 0. `next` 15.5.26, `sharp` 0.35.4, `js-yaml` 4.3.2. |
| pip (`pip-audit -r backend/requirements.txt`) | 0 | 0 |

The 13 open Dependabot PRs were not merged. `requirements.txt` has no lockfile, so every Railway build takes the newest versions allowed. Pinning with a lockfile would make builds reproducible.

## 3. Code review findings and fixes

| # | Finding | Severity | Fix | Test |
| --- | --- | --- | --- | --- |
| 1 | **SSRF in the free scanner.** The block read only the URL text. A public name that resolves to `127.0.0.1` or `169.254.169.254` (e.g. `localtest.me`) passed; `fetch()` followed redirects into private space unchecked; `localhost.`, `0.x.x.x`, `100.64/10`, `::ffff:127.0.0.1` and other spellings passed. The scanner also probes `/.env`, `/.git/config` and more on whatever host it reaches. | High | `lib/scanner/ipguard.ts` (one classifier for IPv4/IPv6 incl. embedded-IPv4 forms), `lib/scanner/netguard.ts` (resolve, and refuse if any address is non-public), `safeFetch` follows redirects itself and checks each hop. | `scripts/verify-ssrf.ts`, 74 checks |
| 2 | **Unbounded body read.** Without `Content-Length`, the whole body was buffered before being truncated to 2.5 MB. | Medium | Stream and stop at 2.5 MB. | `verify-ssrf`: "body without Content-Length is capped" |
| 3 | **SSRF in the deep-scan backend.** `target_url` was fetched with `follow_redirects=True` and no address check, from the Railway host. | High | `backend/url_guard.py`: scheme, name, DNS answer and every redirect hop checked. | `tests/test_url_guard.py` |
| 4 | **Token-bearing path injection.** GitHub `owner/repo` went unvalidated into `api.github.com` paths that carry our `GIT_TOKEN`, so `owner/repo/../../user` could redirect an authenticated request. Any host was accepted for URLs. | High | GitHub naming rules enforced, host must be github.com. | `tests/test_url_guard.py` |
| 5 | **Docker reference injection.** Namespace, repo and tag went unvalidated into Docker Hub API paths and the Trivy argument. Trivy is called with an argument list (no shell), so no command injection, but `..`, `?` and extra path segments reached the Hub API. | Low | Docker Hub grammar enforced. | `tests/test_url_guard.py` |
| 6 | **Host log disclosure.** The `system` log source read the server's own log files and returned the analysis to the customer. | Medium | Off unless `STS_ALLOW_SYSTEM_LOGS` is set; falls back to synthetic logs with a reason. | `tests/test_url_guard.py` |

**Checked, no issue found:**

- Command injection and `child_process`: the only subprocess is Trivy via `subprocess.run([...])` with no shell. No `eval`, `new Function` or `child_process` in the web app.
- Path traversal: the agent proxy allow-lists paths with anchored regexes (`[\w-]` only, no dots). Uploads are read into memory and the filename is only echoed as metadata. `scripts/migrate.ts` reads a fixed directory.
- Report rendering: findings render as React text (escaped). No `dangerouslySetInnerHTML` in app code.
- Slack notifications: the user-supplied webhook must match `https://hooks.slack.com/services/...` and httpx does not follow redirects by default.
- Existing controls look sound: same-origin check on POST routes, fail-closed rate limiting, service-token auth between web and backend, HMAC session cookie, security headers in `middleware.ts`.

## 4. Residual risk

- **DNS rebinding window.** The name is resolved and checked, then `fetch()` resolves it again to connect. A hostile DNS server with a zero TTL could answer differently the second time. Closing this fully means pinning the checked address into the connection (a custom `undici` dispatcher `lookup`, or `node:https` with a guarded `lookup`). Tracked as a follow-up; the redirect and literal-address paths, which are the easy attacks, are closed.
- Run the scanner (Vercel function) and backend (Railway) with no route to internal services where possible. Egress controls are the backstop for any guard bug.
- `README.md` still links the CI badge to `dheerajrvanteru/securetotalscan`.

## 5. Recommendations for Anthony (not done here: repo settings are his call)

1. Revoke the Slack webhook (section 1). This is the only urgent item.
2. Turn on GitHub secret scanning and push protection for this repo (free for public repos). Push protection would have blocked the webhook commit.
3. Make `Web`, `Backend`, `npm audit`, `pip-audit` and `Secret Scan` required status checks on `master`.
4. Keep the repo public only if that is a deliberate marketing choice. Nothing else sensitive was found, but a private repo reduces the cost of the next mistake.
