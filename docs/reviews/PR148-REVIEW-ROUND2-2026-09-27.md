# Independent security re-review: PR #148 round 2, and PR #149

- **Reviewers:** Claude (independent; did not write either PR) and Codex CLI 0.154.0 (second principal, blind to Claude's findings)
- **Date:** 2026-09-27
- **Round 1:** [`PR148-REVIEW-2026-09-27.md`](PR148-REVIEW-2026-09-27.md) (FAIL at `0e4e38e`)

## Verdicts

| PR | Head | Claude | Codex CLI 0.154.0 | **Combined (stricter)** |
| --- | --- | --- | --- | --- |
| #148 round 2 | `7792fddcaade11076bd73a538116f9e82404a533` | PASS_WITH_FINDINGS | PASS_WITH_FINDINGS | **PASS_WITH_FINDINGS** |
| #149 (Next.js RCE patch only) | `f299028b4d074bf3709a346b8dca25c4efd36dec` | PASS | PASS_WITH_FINDINGS | **PASS_WITH_FINDINGS** |

Neither PR has a blocking finding. #149 can merge first. #148 can merge after it, with the findings below as follow-ups. The only red check on #148 is `gitleaks (full history)`. Its log has exactly one finding: `slack-webhook-url`, commit `de06dde`, `app/dashboard/page.tsx:53`. That check stays red until the webhook is revoked in Slack. It is not a defect in this PR.

## PR #148 round 2: the round 1 findings, re-tested

Every bypass was retried against real sockets. The setup:

- The "internal" server listens on 127.0.0.1.
- The public names `localtest.me` and `127.0.0.1.nip.io` really do resolve to 127.0.0.1. That is the answer a second, independent DNS lookup would get.
- The guard's checked answer is injected as 127.0.0.2 or 127.0.0.3, with loopback opted in so the servers can be reached.
- A connection to 127.0.0.1 means the pin was bypassed.

**Across every web and backend probe, 127.0.0.1 received 0 requests.**

| ID | Round 1 | Round 2 result | Evidence |
| --- | --- | --- | --- |
| R1 | High: web connection not pinned | **Closed** | Checked 127.0.0.2, system DNS says 127.0.0.1: the connection went to 127.0.0.2, with 1 resolver call and `Host: localtest.me` kept. See "Bypass attempts" below. |
| R2 | High: web fails open on DNS error | **Closed** | `resolveDestination` refuses on a throw and on `[]`, and there is no fallback to fetch's own DNS. |
| R3 | High: backend not pinned | **Closed** | `guarded_get` connected to 127.0.0.2, never 127.0.0.1. `c._transport._pool._network_backend` is `PinnedBackend`. A redirect to another host was re-resolved and pinned. A redirect back to the same host was re-resolved (4 resolver calls for 4 hops). |
| R4 | Medium: proxy env | **Closed** | Backend: with `HTTP(S)_PROXY` and `ALL_PROXY` pointing at a dead proxy, the request still went direct (200). With `SSL_CERT_FILE` set to a CA the test trusts, it was ignored (verify still failed). Web: with `NODE_USE_ENV_PROXY=1` and a dead proxy, the request went direct (the pinned `Agent` is not the env-proxy dispatcher). |
| R5 | Medium: backend body/deadline | **Closed** (see N3, N4) | A 10 MB body was cut to 65,536 bytes in 0.04 s. |
| R6 | Low: range gaps | **Closed** | Web and backend refuse `::ffff:0:7f00:1` and `::ffff:0:a9fe:a9fe` (`::ffff:0:0:0/96` is the right RFC 2765 prefix). They also refuse `64:ff9b:1::/48`, `3fff::/20`, `2001:10::/28` and `2001:20::/28`. The backend refuses `::127.0.0.1` and `::a9fe:a9fe`. `64:ff9b::8.8.8.8` stays public, as intended. |
| R7 | Low: unencoded repo paths | **Closed** | Checked below. |
| R8 | Low: `$` plus newline | **Closed** | `fullmatch` in both validators. |
| R9 | Info: gitleaks tag | **Closed** | The CI log shows the pull by `Digest: sha256:e1b35e12…07055`. |

### Bypass attempts on the pin (all failed)

| Attempt | Web (undici `connect.lookup`) | Backend (`PinnedBackend`) |
| --- | --- | --- |
| Redirect to a new host | Re-resolved through the guard (`["localtest.me","127.0.0.1.nip.io"]`), landed on the checked 127.0.0.3. | Same, landed on 127.0.0.3. |
| Keep-alive socket reuse across hosts | Not possible: one `Agent` per hop, destroyed in `finally`. 5 sequential and 5 parallel fetches alternating two hosts each hit their own pinned address. | The httpcore pool is keyed by origin, so there is no cross-host reuse. A same-host reuse only reaches a socket already opened to a checked address. |
| Lookup asked for a host other than the pinned one | `ESSRFBLOCKED … was not checked` | `ConnectError: other.example was not checked` |
| Happy Eyeballs / `autoSelectFamily` | `all:true` returns only vetted addresses. `family:6` with only v4 pinned is refused. An `Agent` with `autoSelectFamily:true` still reached only 127.0.0.2. | No Happy Eyeballs in the sync backend: it walks the vetted list in order. |
| IPv6 zone ids | The URL parser rejects `[fe80::1%25eth0]`. A resolver answer of `fe80::1%eth0` is refused. | The zone is stripped before classification, and link-local is refused. |
| Private address in the pin set | Re-check refuses (`10.0.0.1`, `fe80::1`). | Re-check refuses (`ConnectError`). |
| IP literal host | Checked statically, and Node does not call lookup for literals, so the checked literal is the target. | Pinned to itself. |

### TLS still verifies against the hostname

Each case was tested with a local HTTPS server on the pinned address, trusting a throwaway test CA:

- **Web.** A certificate for `wrong.example` failed with `ERR_TLS_CERT_ALTNAME_INVALID`. A certificate for `localtest.me` got 200. The server saw `SNI = localtest.me`. A real public site, `https://example.com`, got 200 through the pinned dispatcher.
- **Backend.** A certificate for `wrong.example` failed with `CERTIFICATE_VERIFY_FAILED: Hostname mismatch`. A certificate for `localtest.me` got 200.

### R7: keeping '/' is safe

- `..`, `.`, empty segments and control characters are refused before encoding.
- `%` is encoded, so the encoded forms cannot decode back into traversal:
  - `%2e%2e/%2e%2e/user` becomes `%252e%252e/%252e%252e/user`.
  - `..%2f..%2fuser` becomes `..%252f..%252fuser`.
  - `a/..%2F..%2Fx.py` becomes `a/..%252F..%252Fx.py`.
- `?` becomes `%3F` and `#` becomes `%23`.
- The backslash form `a\..\b` becomes `a%5C..%5Cb`.
- Lookalike dots (fullwidth `．．`, `․․`) and `.. ` (dot, dot, space) are encoded, so none of them can act as a dot segment.
- Branch names follow the same rules: `feature/x` is kept, `a/../../..` is refused, `x?recursive=0` becomes `x%3Frecursive%3D0`.
- Each result was checked as the `raw_path` that httpx actually sends.

### New findings (non-blocking)

| ID | Sev | Location | Finding | Fix |
| --- | --- | --- | --- | --- |
| N1 | Low (Codex: Medium) | `backend/url_guard.py` `guarded_get(client=...)` | The `client` parameter swaps in any `httpx.Client` and so skips `PinnedBackend`. The docstring says it is for tests, and no production caller passes it (the only caller is `vuln_scanner.py:83`). Any future caller that passes a plain client would silently reopen rebinding. | Move it behind a test-only factory, or assert that the supplied client's pool uses `PinnedBackend`. |
| N2 | Low | `lib/scanner/fetcher.ts` / `netguard.ts`; `backend/url_guard.py` `resolve_url` | DNS resolution is not covered by the deadline. On the web, the abort signal does not cancel `dns.lookup`, and the 8 s timer is only enforced once `fetch` starts. In the backend, `getaddrinfo` runs before `remaining()` is consulted. A slow authoritative server can hold a worker (and, on the web, libuv threadpool slots) past the stated limits. This is availability only, not SSRF. | Race the lookup against the deadline (`Promise.race` or an abort-aware resolver on the web, a resolver with a timeout in the backend). |
| N3 | Low | `backend/url_guard.py` body loop | The per-read timeout is fixed when the request starts, and `remaining()` runs only after a chunk arrives. The real ceiling is therefore about `deadline + timeout`, not 20 s. | Recompute the read timeout per chunk, or wrap the call in a hard outer deadline. |
| N4 | Low | `backend/url_guard.py` `pinned_client` | Pinning depends on the private `HTTPTransport._pool`, and `requirements.txt` allows any `httpx>=0.27.0`. The guard test catches silent breakage, but a minor httpx release could break the backend fetch. | Cap `httpx<0.29` (or pin it), or build the `httpcore.ConnectionPool` behind a small custom `BaseTransport` rather than overwriting a private field. |
| N5 | Info | `backend/url_guard.py` | The returned `httpx.Response` is built from raw (still encoded) bytes but keeps `Content-Encoding`, so reading `.content` or `.text` on a gzip response would try to decode a truncated stream. The only caller reads headers, so there is no impact today. | Drop `Content-Encoding` from the rebuilt response, or document that only the headers are valid. |
| N6 | Info | `ipguard.ts`, `url_guard.py` | A global IPv6 address with a zone id (`2606:4700::1111%1`) is accepted, and the zone is passed to the socket. On a global address the zone is meaningless and cannot reach link-local, so there is no impact. | Optional: strip zones from non-link-local pins. |

### Test runs at `7792fdd` (once each)

| Check | Result |
| --- | --- |
| `npm ci` | exit 0 (undici 7.30.0 added) |
| `npm run verify:scanner` | exit 0, `VERIFY: PASS`, 367 PASS, 0 FAIL |
| Backend `pytest tests/` | 224 passed |
| `npm run typecheck` / `lint` / `build` | all exit 0 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| CI on the PR head | Web, Backend, npm audit, pip-audit, CodeQL (js/ts and python), Dependency Review: success. gitleaks: failure on the one expected Slack finding only. |

## PR #149: Next.js RCE patch on its own

- **One commit, `f299028`, directly on current `master`.** It touches only `package.json` and `package-lock.json`.
- **`package.json`:**
  - `next` 15.5.23 to 15.5.26.
  - `eslint-config-next` 15.5.23 to 15.5.26 (dev, released with next).
  - `sharp` override `^0.35.3` to `^0.35.4`.
  - Nothing else.
- **Lockfile, diffed as JSON:** 40 entries changed, all version bumps. Nothing was added or removed.
  - `next`, `@next/env`, `@next/eslint-plugin-next` and the `@next/swc-*` binaries go to 15.5.26.
  - `eslint-config-next` goes to 15.5.26.
  - `sharp` and the `@img/sharp-*` binaries go to 0.35.4, and `@img/sharp-libvips-*` to 1.3.3.
  - `js-yaml` goes from 4.3.1 to 4.3.2.
- **Package sources:** every resolved URL is on `registry.npmjs.org`, and every entry has an integrity hash.
- **CI:** all 7 checks pass (Web, Backend, npm audit, pip-audit, CodeQL x2, Dependency Review).
- **Finding P1 (Low, Codex).** The `js-yaml` override is still `^4.3.1`, a range that includes the vulnerable version. The lockfile pins 4.3.2 and `npm ci` honours it, so nothing vulnerable is installed today. Tighten the override to `^4.3.2` in a follow-up. It does not block the merge.

## Codex CLI 0.154.0 verdicts (verbatim)

Run: `codex exec --sandbox read-only --skip-git-repo-check -` from an empty folder, with a static prompt on stdin. The #148 prompt held the builder's claims, the attack list and the key files at `7792fdd`. The #149 prompt held the diff, the lockfile change list and the CI results. Claude's findings were not included in either prompt.

### PR #148 round 2

```
VERDICT: PASS_WITH_FINDINGS

ID | Severity (Critical/High/Medium/Low/Info) | File:line | Finding | Recommended fix
--- | --- | --- | --- | ---
R2-01 | Medium | backend/url_guard.py:221 | `guarded_get(..., client=...)` bypasses `PinnedBackend`; any non-test caller passing a normal `httpx.Client` reopens the DNS-rebinding gap after `resolve_url`. Current shown app path does not pass `client`. | Remove the production `client` escape hatch, or require a mock-only transport/factory in tests; assert supplied clients use the pinned transport.
R2-02 | Low | backend/url_guard.py:127 | The 20s deadline does not cover blocking DNS resolution, so `_system_resolver` can exceed the claimed overall deadline. | Check remaining time before resolution and perform DNS with an enforced timeout/cancellable worker.
R2-03 | Low | backend/url_guard.py:250 | Body reads can overrun the overall deadline by up to the per-read/httpx timeout because the timeout is fixed at request start and `remaining()` is checked only after chunks arrive. | Recompute remaining timeout before each blocking read or wrap the entire operation in a hard outer deadline.

No direct SSRF bypass found in the shown production paths: redirects are checked per hop, web uses a fresh pinned undici Agent per hop, and proxy env is disabled in backend.
Happy Eyeballs/`all:true`, IP literals, IPv6 zone ids, and encoded GitHub `..` forms appear fail-closed or correctly encoded.
Backend TLS hostname verification appears preserved by the httpcore network-backend swap, but this is a library-behavior inference from the code, unverified.
Keep-alive reuse across backend same-origin hops may avoid a new TCP connect, but only to a socket that was previously opened to a checked public address; no SSRF bypass found.
```

### PR #149

```
VERDICT: PASS_WITH_FINDINGS

| ID | Severity | File | Finding | Recommended fix |
|---|---|---|---|---|
| F-001 | Low | package.json | `js-yaml` override remains `^4.3.1`, a range that includes vulnerable `4.3.1`, though the lockfile resolves `4.3.2`. | Change override to `^4.3.2` or pin `4.3.2`. |

Changes are limited to expected dependency/security updates: Next/ESLint Next, sharp/libvips platform packages, and js-yaml.  
No unexpected packages or non-registry sources are indicated; resolved host is only `registry.npmjs.org`, and CI/audit/dependency review all passed.  
Safe to merge, preferably with the `js-yaml` range tightened.
```

**Where they agree:** no SSRF bypass in #148's production paths. Both flagged the `client=` escape hatch (N1/R2-01), the gaps in DNS deadline coverage (N2/R2-02) and the per-read overrun (N3/R2-03). Codex marked backend TLS hostname checking "unverified". Claude verified it (Hostname mismatch is refused, the correct name gets 200). On #149, Claude takes Codex's P1 as a Low follow-up.

## Scope and conduct

Reviewed in a separate clone. No pushes to either PR branch, no merge, no force push, no settings changes. No secret was printed or used. The Slack webhook is referred to only by commit `de06dde` and `app/dashboard/page.tsx:53`. Probe servers listened on 127.0.0.1 to 127.0.0.3 only, and the TLS certificates were throwaway self-signed ones. The only external traffic was DNS for `localtest.me` and `127.0.0.1.nip.io`, plus one HTTPS GET to `example.com`.
