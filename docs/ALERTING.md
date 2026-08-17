# Operational alerting

**Status:** live from PR 0.7 (Phase 0). Webhook only — there is no email path
yet, and the reason is in "Not built yet" below.

Alerts go to an external on-call endpoint operated by Viktor, who triages and
reports onward. This document is the contract: what we send, how it is signed,
what each severity means, and what the receiver has to do. Hand it to whoever
implements the receiving end.

---

## 1. Why this exists at all

The backend was dead from 2026-06-14 to 2026-08-17 — two months — behind a
green CI pipeline. Nothing told anyone. PR 0.4 fixed the pipeline's part of
that (a deploy that reported success without waiting for its result); this is
the other half: something must notice when production breaks *between* deploys.

That history sets one hard design rule, which is why the health check is a
GitHub Actions workflow and not a route in the app:

> **An alert path that lives inside the thing it monitors is dead in exactly
> the case that matters.**

---

## 2. Transport

`POST` to `ALERT_WEBHOOK_URL` with a JSON body.

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `x-sts-signature` | `sha256=<hex>` — HMAC-SHA256 of the **exact request body bytes**, keyed with `ALERT_WEBHOOK_SECRET` |
| `x-sts-timestamp` | Send time, epoch seconds |

**Verifying.** Compute the HMAC over the raw body before any JSON parsing or
re-serialisation — a re-serialised body will not match, since key order and
whitespace are part of the signed bytes. Compare in constant time. Reject a
request whose `x-sts-timestamp` is more than a few minutes old to blunt replay.

Timeout is **2 seconds** and there are **no retries**. An alert that cannot be
delivered promptly is dropped, counted and logged locally rather than delaying
a customer request. If the endpoint is slow, alerts are lost — so the receiver
should acknowledge fast and do its work afterwards.

## 3. Payload

```json
{
  "severity": "critical",
  "kind": "backend-down",
  "site": "https://securetotalscan-api-production.up.railway.app",
  "customer": "c_9f2a41c7b0e35d18",
  "detail": "All 3 health probes failed over 90s. Deep scans are unavailable.",
  "occurred_at": "2026-08-17T09:42:11.004Z",
  "dedupe_key": "backend-down",
  "source": "health-check"
}
```

| Field | Notes |
|---|---|
| `severity` | `critical` \| `warning` \| `info` — see §4 |
| `kind` | Stable machine label for the condition |
| `site` | Hostname or URL involved; empty when not applicable |
| `customer` | **Pseudonymous reference, never an email address** — see §6 |
| `detail` | One redacted line of human context, max 500 chars |
| `occurred_at` | ISO 8601, UTC |
| `dedupe_key` | Stable for the condition; see §5 |
| `source` | `web` (Vercel) \| `backend` (Railway) \| `health-check` (GitHub Actions) |

Fields are always present; unused ones are empty strings rather than omitted,
so a receiver never has to distinguish "absent" from "empty".

## 4. Severity

Only `critical` wakes a human. Everything else is logged for review.

`critical` is reserved for **payments broken, scanner down, or deep-scan agents
erroring** — because a paged human costs real money and attention, and an alert
that cries wolf gets muted, at which point the whole system is decorative.

| Severity | Meaning | Receiver behaviour |
|---|---|---|
| `critical` | Customers cannot do the thing they paid for | Page. 5-minute cooldown, 20/day cap |
| `warning` | Degraded, or a single failure in a path that usually works | Log; review in batch |
| `info` | Notable but not wrong | Log |

**A failing health check is `critical`, not `warning`.** Viktor's original spec
put health checks at "warning or info" while also reserving `critical` for
"scanner down" — but a health check failing *is* the scanner being down. The
rule that resolves it: **every probe in a run failing is `critical`; some
probes failing is `warning`.** A blip is a blip; a sustained failure is the
outage that went unnoticed for two months.

## 5. Deduplication

`dedupe_key` must be **stable for the condition**. It must never contain a
timestamp, a session id, a scan id, or anything else that changes per
occurrence.

This matters more than it looks. The receiver suppresses repeats of a key
within a 6-hour window. A key that varies per event defeats suppression
entirely, so a flapping check pages continuously until someone mutes the
channel — and a muted channel is worse than no alerting, because it looks like
coverage.

Keys currently sent:

| `kind` | `dedupe_key` | Severity | Source |
|---|---|---|---|
| `backend-down` | `backend-down` | critical | health-check |
| `backend-flapping` | `backend-flapping` | warning | health-check |
| `web-down` | `web-down` | critical | health-check |
| `web-flapping` | `web-flapping` | warning | health-check |
| `ratelimit-store-unavailable` | `ratelimit-store-unavailable` | critical | web |
| `agent-backend-unreachable` | `agent-backend-unreachable` | critical | web |
| `agent-backend-5xx` | `agent-backend-5xx:<status>` | warning | web |
| `scan-unhandled-error` | `scan-unhandled-error:<ErrorClass>` | warning | web |
| `deep-scan-agent-error` | `deep-scan-agent-error:<agent>:<ErrorClass>` | critical | backend |
| `deep-scan-pipeline-error` | `deep-scan-pipeline-error:<ErrorClass>` | warning | backend |
| `deep-scan-run-stuck` | `deep-scan-run-stuck:<log_source>` | critical | backend |

The suffixed keys vary by *failure mode*, not by occurrence — a new exception
type is genuinely new information and should not be suppressed behind an
unrelated one.

## 6. What never leaves the process

No secrets, no tokens, no request bodies, and **no raw customer email
addresses**.

`detail` passes through a redactor (`redact()` in both implementations) that
strips bearer credentials, `sk_`/`ghp_`-style keys, `secret=`/`token=`-shaped
pairs, JWTs and bare email addresses, then truncates to 500 characters. That is
a backstop, not permission to pass raw exception text through — call sites
write their own short description.

Customer identity travels as `customerRef()` / `customer_ref()`: an HMAC-SHA256
of the lowercased address under `ALERT_WEBHOOK_SECRET`, truncated, prefixed
`c_`. It is stable, so the receiver can see that twenty alerts concern one
account, and it is not reversible, so the address itself never reaches a
third-party endpoint.

**This is deliberate and it is a gap to close, not a permanent design.**
`docs/PR-PLAN.md` §"Operational alerting" records an outstanding confirmation:
the webhook host and the email host Viktor supplied are two different domains,
and since the payload was specified to carry customer email addresses, Anthony
must confirm in writing that both endpoints are Viktor's before any address is
sent. Until that confirmation exists, the pseudonymous reference lets alerting
ship without making an unreviewed disclosure. When it exists — and once Phase 2
gives us real customer records — the field can carry an account id.

## 7. Sources and configuration

Three senders, because failures happen in three places, and each needs the same
pair of variables:

| Source | Runs on | Where the variables must be set |
|---|---|---|
| `web` | Vercel | Vercel production env, synced by `scripts/sync-vercel-env.sh` |
| `backend` | Railway | Railway env, synced by `scripts/sync-railway-env.sh` |
| `health-check` | GitHub Actions | The `prod` GitHub environment, read directly |

The `prod` GitHub environment is the source of truth; CD carries it to the
other two. This follows the standing environment-variable rule in
`docs/PR-PLAN.md` §1: a variable added to the code but not to the sync script
never reaches production, and nothing says so.

```
ALERT_WEBHOOK_URL      Full endpoint URL. It embeds a token, so it is a secret
                       in its own right — never a constant in the source, and
                       rotatable without a code change.
ALERT_WEBHOOK_SECRET   HMAC signing key. Also keys the customer reference, so
                       rotating it changes every `customer` value.
```

**With either unset, alerting is a silent no-op.** That is the intended state
locally and in CI: a developer running a scan must not page anyone, and a test
suite must not depend on network access.

## 8. When alerting itself breaks

Every send failure is swallowed — an alert must never break a scan — but it is
also **counted and logged**. Fire-and-forget with silently discarded errors
reproduces the exact pathology this module exists to fix, one level up: if
alerting breaks, nothing reports that alerting broke.

- Web tier: `alertFailureCount()`, logged on each failure with the running
  count.
- Backend: `alerting.failure_count()`, same.
- Health check: a failed alert POST emits `::error::` and turns the workflow
  run red, so it is visible in the Actions list without anyone subscribing to
  anything.

The counters are per-process and reset on restart. They are a smoke detector,
not a metric; a real one arrives with Phase 2 persistence.

## 9. Not built yet

- **The email path.** Anthony wants alerts emailed so GHL workflows can trigger
  off them. That needs a mailer, and `RESEND_API_KEY` only reaches production
  in PR 2.5. Phase 0 is webhook-only. Viktor's own fallback address is
  unauthenticated and must never appear on a public page or in
  customer-facing output.
- **Payment and checkout failures.** Payments do not exist until Phase 2, so
  that call site is a hook added in PR 2.6.
- **Consecutive-failure counting for application routes.** The health check
  counts probes within one run, which needs no shared state. Doing the same for
  `/api/scan` — "the last N scans all 500'd" — needs a counter shared across
  serverless instances. Until then a single scan failure is a `warning` and
  "the scanner is down for everyone" is caught by the health check.
- **A real timeout on deep runs.** `deep-scan-run-stuck` reports a run that has
  passed `STS_SLOW_RUN_ALERT_SECONDS` (default 600) without finishing; it does
  not cancel it. `asyncio.to_thread` cannot be interrupted, and killing a run
  that is merely slow would lose work the customer paid for. Cancellation needs
  the pipeline restructured and belongs with the Phase 4 scheduler.

## 10. Testing it

Offline, no network, run by CI on every PR:

```bash
npm run verify:alerting                     # web tier
cd backend && python -m pytest tests/test_alerting.py -q   # backend tier
```

Both cover the same rules: unconfigured is silent, the signature matches an
independently computed HMAC of the exact body, redaction removes credentials
and addresses, the customer reference is stable and non-reversible, and a
failing or hanging endpoint is swallowed but counted.

To exercise the real endpoint once, run the health check manually
(Actions → Health check → Run workflow) at a moment when production is healthy,
then check that no alert arrived; then point `BACKEND_URL` at a dead host in a
branch and confirm one does.
