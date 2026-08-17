# Baseline — August 2026

**Phase 0 exit evidence.** Recorded 2026-08-17 against `master` @ `3048ba4`.

The point of this document is that it is checkable. Every claim below either
links to a run whose log says so, or is explicitly marked as **not captured**
with the way to capture it. Phase 0 existed because production had been dead
for two months behind a green pipeline — a baseline made of assertions would
repeat exactly that mistake.

Three states are used and they are not interchangeable:

| | Meaning |
|---|---|
| **Verified** | A machine-readable artefact says so, and it is linked |
| **Hand-verified** | A person did it and reported the result; no artefact exists |
| **Not captured** | We do not know. The way to find out is stated |

---

## 1. Backend deploy and health — Verified

**Evidence:** CD [run 32011834941](https://github.com/anthonym71/securetotalscan/actions/runs/32011834941),
job `Railway`, `head_sha` `3048ba4`.

```
Deploy backend to Railway   08:45:42 → 08:46:25   (43s)
…
Deploy complete
Verifying backend health at https://securetotalscan-api-production.up.railway.app/health/trivy
Backend healthy: {"available":true,"binary":"/usr/local/bin/trivy","db_ready":true,"message":"Trivy CVE scanning enabled"}
```

Two things are established here, and the second is the one that matters.

**Trivy is installed and its CVE database is downloaded.** `available: true`
and `db_ready: true`, so Docker image scanning works rather than silently
degrading.

**The deploy waited for its result.** This is the first CD run after #110, and
the deploy step took **43 seconds**. Every previous run took **one second**,
because `railway up --detach` returned the moment the upload finished and never
learned whether Railway built, deployed or healthchecked. That one second is
what a two-month outage looked like from the outside. It now builds a Docker
image in the log, waits, and then reads the health payload — not the status
code, because `/health/trivy` returns HTTP 200 even when Trivy is missing.

## 2. What is actually running — Verified

From the same build log, the packages Railway installed into the image:

```
langgraph-1.2.11  langgraph-checkpoint-4.2.0  langgraph-prebuilt-1.1.0
langgraph-sdk-0.4.2  langchain-core-1.5.5  openai-3.1.0
fastapi-0.141.1  starlette-1.6.0  uvicorn-0.52.3  pydantic-2.13.4  httpx-0.28.1
```

Worth recording as a baseline in its own right, because it is not what the
repository appeared to say. `requirements.txt` pinned floors of
`openai>=1.30.0` and `langgraph>=0.1.0`, and there is **no lockfile under
`backend/`** — so every build installs the newest version satisfying the floor,
and production was two majors above where the manifest suggested. PR #108
corrected the constraints to hold the current major
(`openai>=3.1.0,<4`, `langgraph>=1.2.11,<2`) after `pip-audit` failed the
original, lower caps with six known vulnerabilities.

The transitive tree above is still unpinned. Record it again with each cost
measurement run (`docs/UNIT-ECONOMICS.md` §5); if two runs need to be exactly
comparable, that wants a lockfile.

## 3. CI — Verified

CD is triggered by `workflow_run` on a successful CI run on `master`, so the
run cited in §1 firing at all is evidence that CI passed on `3048ba4`. Seven
checks: `Web`, `Backend`, `Analyze (javascript-typescript)`, `Analyze (python)`,
`Review dependencies`, `pip-audit`, `npm audit`.

`Review dependencies` passes only since the repository Dependency Graph was
enabled earlier today. Before that it failed on every PR, which meant a real
dependency problem would have been invisible in the noise — the same class of
failure as §1.

**Backend suite: 88 tests at `3048ba4`.** Now 110 on the branches in flight
(15 for alerting, 7 for the cost harness).

## 4. Authenticated deep-agent round trip — Hand-verified

Signed in at `/login`, ran a Synthetic-logs deep analysis, and it returned live
results: anomalies, OWASP-mapped vulnerabilities, NIST/SOC 2 compliance gaps,
RAG passages and an action plan. That exercises the whole chain —
browser → Vercel → authenticated `/api/agent/*` proxy → Railway → agents → LLM.

**This can only be proven this way.** Both halves of the shared secret
(`AGENT_SERVICE_TOKEN` on Vercel, `STS_SERVICE_TOKEN` on Railway) are masked on
both platforms, so "the token is set" and "the token is correct" are different
claims and only a real round trip settles the second.

**No artefact exists.** It is recorded in `docs/CHANGELOG-BUILD.md` and nowhere
a machine can check. Phase 3 should replace this with an automated
authenticated smoke test; until then it is a person's word, and this document
says so rather than dressing it up.

**The PRD Phase 0 exit condition — deep-agent proxy reachable by an
authenticated user — is met.**

## 5. Self-scan grade — **Not captured**

The release gate is **grade A on `securetotalscan.com`** (PRD §7). No grade is
recorded here, and none should be invented.

The Phase 0 build environment cannot reach either production host:

```
$ curl -s -o /dev/null -w "%{http_code}" https://securetotalscan.com
000
$ curl -s -o /dev/null -w "%{http_code}" https://securetotalscan-api-production.up.railway.app/health/trivy
000
```

Egress reaches GitHub and PyPI and nothing else, which is also why the cost
harness runs in Actions rather than from a session.

**How to capture it:** run the **Cost measurement** workflow (PR 0.6) with
`groups: surface` and `skip_surface: false`. The surface path records grade and
score for `securetotalscan.com` and Anthony's three other sites, from a runner
that can reach them. Paste the result into §8 below.

Note that the grade will move once PR 1.3 lands the HTTP-posture check —
that PR carries its own re-baseline, and the number captured now is the
before-figure for that comparison.

## 6. Rate limiting — Verified by test, not in production

`/api/scan`, `/api/lead`, `/api/auth/login` and the deep-agent proxy now fail
closed when no durable counter can be applied (#109). Upstash is live in
production and the credentials reached Vercel in today's sync.

**Verified** by 17 offline checks in `verify:scanner`, covering
production-without-a-store, an unreachable store, HTTP 5xx, a transient error
absorbed by the retry, and preview degrading to memory rather than refusing.

**Not captured:** that production is presently counting in Redis rather than
refusing. A 503 from `/api/scan` would prove the failure mode; a 200 proves the
happy path. Neither can be checked from here (§5). The health check added in
PR 0.7 probes the site root, which would catch a total outage but not a limiter
misconfiguration specifically.

## 7. Known gaps at the Phase 0 boundary

Recorded so they are not rediscovered as surprises.

1. **Railway's own GitHub auto-deploy may still be enabled** alongside CD. Two
   deploy paths on one service race each other and make "what is running"
   unanswerable. PRD §0.1.1 says the pipeline wins, so Railway's trigger should
   be off. **Still unconfirmed** — it was flagged before PR 0.4 and has not
   been answered.
2. **No persistence of any kind.** No scan, customer or entitlement is stored.
   Phase 2, PR 2.1.
3. **The paywall is client-side only.** `/api/scan` returns the complete
   report including every `fixPrompt`. Phase 2, PR 2.3.
4. **`STS_ACCESS_CODES` is a shared code, not accounts.** Phase 3, PR 3.1.
5. **No email delivery.** `RESEND_API_KEY` is not in production, which is also
   why PR 0.7's alerting is webhook-only. Phase 2, PR 2.5.
6. **No lockfile under `backend/`** (§2).
7. **The eval store is in-memory.** `/evals` is lost on a backend restart, so
   the cost harness reads each session's record immediately after its run
   rather than collecting at the end.

## 8. Captured measurements

> Empty on purpose. Add the self-scan grade here once §5 has been run, and
> link the workflow run that produced it.

### Template

```
### YYYY-MM-DD — self-scan — workflow run <url>

securetotalscan.com   grade …  score …
ospry.ai              grade …  score …
hellofreedom.co       grade …  score …
myghlcoach.com        grade …  score …
```
