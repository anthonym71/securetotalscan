# Build changelog

Required by PRD v1.2 §0.1.8. Every change gets an entry: date, phase, what
changed in code, what changed in GHL (object + ID), what was verified.
Newest first.

---

## 2026-08-17 — Phase 0, PR 0.2 (dependency triage)

**Code:**

- `backend/requirements.txt` — **removed `langchain` and `langchain-openai`.**
  Verified by import search across `backend/` including `tests/`: neither is
  imported anywhere. They were declared dependencies pulling large trees into a
  security product's image for no benefit, and Dependabot #101 and #103 were
  proposing major upgrades to libraries the code never loads. Removing closes
  both permanently rather than deferring them.
- Held `openai` below 2.0 and `langgraph` below 1.0 until PR 0.6 records the
  cost baseline. `openai` is the client library used to reach OpenRouter and
  `CallMeta` reads the token counts from its responses, so a major that renames
  those fields would invalidate the measurement; `langgraph` sequences the five
  agents and a major could change execution order, retries or call count.
- `.github/dependabot.yml` — deferred breaking majors for `tailwindcss`,
  `typescript` and `eslint` to a post-launch window; held `openai` and
  `langgraph` majors until PR 0.6; grouped dev-dependency minors/patches and all
  GitHub Actions bumps so they arrive as one PR each instead of five. Every
  ignore carries a named condition for lifting it.

**GHL:** No change. **Infrastructure:** No change.

**Verified:** installed the trimmed dependency set in a clean virtualenv and ran
the backend suite — **88 passed**. The removal is confirmed by a green test run,
not by inspection alone.

**Still missing:** the Dependabot queue itself is not yet triaged — the open PRs
still need closing or merging in line with this policy.

---

## 2026-08-17 — Phase 0, PR 0.5 (baseline evidence)

**Code:** `docs/BASELINE-2026-08.md`. Documentation only.

Phase 0 exit evidence against `master` @ `3048ba4`. Every claim either links to
a run whose log says so, or is marked **not captured** with the way to capture
it — a baseline made of assertions would repeat the exact failure Phase 0
existed to fix. Three states are used and kept distinct: **verified**
(machine-readable artefact, linked), **hand-verified** (a person did it, no
artefact), **not captured**.

**Verified:** Railway deploy and health from CD run 32011834941, including the
`/health/trivy` payload and the 43-second deploy step that used to take one
second; the package versions Railway actually installed
(langgraph 1.2.11, openai 3.1.0, and the unpinned transitive tree); CI green on
`3048ba4`; rate limiting by its 17 offline checks.

**Hand-verified, and labelled as such:** the authenticated deep-agent round
trip. No artefact exists — both halves of the shared secret are masked on both
platforms, so only a real round trip settles "the token is correct" as opposed
to "the token is set". Phase 3 should replace this with an automated
authenticated smoke test.

**Not captured: the self-scan grade**, which is the release gate. The Phase 0
build environment cannot reach either production host — `curl` returns HTTP 000
for both, which is also why the cost harness runs in Actions. The document
records the exact commands and their output rather than an estimate, and states
how to capture the grade: the PR 0.6 workflow with `groups: surface` and
`skip_surface: false`. Also noted: the grade will move when PR 1.3 adds the
HTTP-posture check, so the figure captured now is the before-number for that
comparison.

**Seven known gaps recorded** at the Phase 0 boundary, including one still
unanswered from before PR 0.4 — whether Railway's own GitHub auto-deploy is
still enabled alongside CD. Two deploy paths on one service race each other and
make "what is running" unanswerable.

**GHL:** No change. **Infrastructure:** No change. No DNS record touched, no
environment variable set, no deployment triggered.
## 2026-08-17 — Phase 0.7 (operational alerting, webhook only)

**Code:** `lib/alerting.ts` (web tier), `backend/alerting.py` (backend tier),
`scripts/post-alert.sh` (health check), `.github/workflows/health-check.yml`,
`docs/ALERTING.md`. Call sites added in `app/api/scan/route.ts`,
`app/api/agent/[...path]/route.ts`, `backend/orchestrator.py` and
`backend/main.py`.

An HMAC-signed JSON alert is posted to `ALERT_WEBHOOK_URL`. Fire-and-forget,
2-second timeout, no retries, exceptions swallowed but **counted and logged** —
alerting that fails silently reproduces the pathology it exists to fix.
Unconfigured is a silent no-op, so local runs and CI page nobody.

**The health check runs in GitHub Actions, not in the app.** An alert path that
lives inside the thing it monitors is dead in exactly the case that matters —
which is how the Railway outage lasted two months. Three probes 45s apart every
15 minutes; all failing is `critical`, some failing is `warning`. That resolves
the conflict in Viktor's spec, which had health checks at "warning or info"
while reserving `critical` for "scanner down".

**No customer email address is sent.** The payload's `customer` field carries an
HMAC digest of the address (`c_…`), not the address. `docs/PR-PLAN.md` records
an outstanding confirmation — the webhook host and the email host Viktor gave
are different domains, and the payload was specified to carry addresses. Rather
than block Phase 0 on that confirmation or send addresses without it, identity
travels pseudonymously: stable enough to correlate, not reversible. The field
can carry a real account id once the confirmation exists and Phase 2 creates
accounts.

**Environment variables Anthony must set:** `ALERT_WEBHOOK_URL` and
`ALERT_WEBHOOK_SECRET`, as secrets in the **`prod` GitHub environment** —
already done. Both are now added to `scripts/sync-vercel-env.sh`,
`scripts/sync-railway-env.sh` and the `cd.yml` comment block, per the standing
environment-variable rule; the GitHub environment is the source and CD carries
it to Vercel and Railway.

**Verified:** `npm run typecheck` clean; `npm run build` succeeds;
`npm run verify:scanner` passes including **31 new alerting checks**; backend
suite **103 passed** (15 new). The signature was cross-checked across all three
implementations — bash/openssl, Python and Node produce byte-identical HMACs for
the same payload, so a receiver written against one verifies all three.

**Not built:** the email path (needs the Phase 2 mailer — `RESEND_API_KEY` is
not in production yet), the payment/checkout call site (Phase 2, PR 2.6),
consecutive-failure counting for application routes (needs shared state), and
real cancellation of a stuck deep run (`asyncio.to_thread` cannot be
interrupted; belongs with the Phase 4 scheduler). All four are recorded in
`docs/ALERTING.md` §9.

**GHL:** No change. **DNS:** No record touched.

---

## 2026-08-17 — Phase 0 (PRs 0.2, 0.3, 0.4 merged)

**Merged in order:** #108 (dependency triage), #109 (durable rate limiting,
superseding #97, now closed), #110 (CD deploy verification).

**Correction made to #108 before merge, and the reason is worth keeping.** The
PR originally capped `openai<2` and `langgraph<1` to hold the LLM path still
for the PR 0.6 cost measurement. pip-audit failed it with six known
vulnerabilities in langgraph 0.6.11, langgraph-checkpoint 3.0.1 and
langgraph-sdk 0.2.15.

The cause is a property of the repository, not a typo: **there is no lockfile
under `backend/`**, so the lines in `requirements.txt` are floors, not a record
of what runs — every Railway build installs the newest version satisfying them.
Production already ran **openai 3.1.0** and **langgraph 1.2.11**, two majors
above those caps. The cap would not have held anything still; it would have
downgraded the runtime two majors on the next deploy and reintroduced the
advisories fixed in langgraph 1.0.10 / langgraph-checkpoint 4.0.0 /
langgraph-sdk 0.3.15, while the measurement it was meant to protect described
software we had just stopped running.

Held at the current major instead — `openai>=3.1.0,<4`, `langgraph>=1.2.11,<2`.
Verified in a clean virtualenv: 88 backend tests pass on those versions and
`pip-audit` is clean.

**Consequence for PR 0.6:** floors alone do not make the cost baseline
reproducible. The transitive tree (`langgraph-checkpoint`, `langgraph-sdk`,
`langchain-core`) is still unpinned, so two runs a week apart can install
different versions. Exact reproducibility wants a lockfile — a separate change,
not yet made.

**Dependabot #101, #103, #104, #105** are all now closeable: #101 and #103
target packages that no longer exist in the manifest, #104 and #105 are
satisfied by the new floors.

---

## 2026-08-17 — Phase 0 (service tokens, Upstash, dashboard access — end-to-end proven)

**Infrastructure, all set by Anthony and verified through the pipeline:**

- `STS_SERVICE_TOKEN` (Railway) and `AGENT_SERVICE_TOKEN` (Vercel, Production,
  Sensitive). Note the two names are **not** interchangeable and neither side
  has a fallback: `lib/security/serviceAuth.ts` reads only `AGENT_SERVICE_TOKEN`,
  `backend/service_auth.py` reads only `STS_SERVICE_TOKEN`. An automatic
  copy also created `STS_SERVICE_TOKEN` entries on Vercel; they are inert and
  can be tidied up later.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` added as **secrets in
  the `prod` GitHub environment** and delivered by the pipeline. First attempt
  created two *environments* named after the secrets instead; the deploy job
  only reads `prod`, so nothing was delivered and the sync log showed three
  variables instead of five. Corrected, strays deleted.
- `STS_ACCESS_CODES` set on Vercel Production. Dashboard login works.

**Verified end to end:** signed in at `/login`, ran a Synthetic-logs deep
analysis, and it returned live results — anomalies, OWASP-mapped
vulnerabilities, NIST/SOC 2 compliance gaps, RAG passages and an action plan.
This exercises browser → Vercel → authenticated `/api/agent/*` proxy → Railway
→ five agents → GPT-4o. **The service-token handshake can only be proven this
way** (both values are masked on both platforms), so items "token set" and
"token correct" were tracked separately until this run. PRD Phase 0 exit
condition — deep-agent proxy reachable by an authenticated user — is met.

**Defect found, dashboard display (not data):** `FindingList` in
`app/dashboard/page.tsx:467` derives its label from `message`, `description`,
`title` or `type` and otherwise falls back to `JSON.stringify(item)`. The
backend's vulnerability objects carry `category`, `name`, `severity`,
`recommendation`, `linked_anomaly` — so every vulnerability renders as raw JSON
while anomalies and compliance gaps render correctly. `name` is present and
simply not consulted. Roughly a one-line fix. It matters because this dashboard
is what the $19 and $49 tiers sell, and because the Phase 1 preview will mirror
it — fixing it first stops the bug being copied into the mock.

**Note:** logging in writes a GHL contact tagged `capture-dashboard-login`, so
the address typed at the login screen lands in the CRM. A mistyped address was
entered during this test and should be removed. Incidentally confirms the GHL
credentials synced in this session are working.

---

## 2026-08-17 — Phase 0 (infrastructure: GitHub access, CI, Railway restored)

**Code:** `docs/PR-PLAN.md` updated — new PR 0.4 (`phase0/cd-deploy-verification`),
old 0.4 renumbered to 0.5, cost measurement to 0.6, PR count 30 → 31.

**GitHub:** The Claude GitHub App was **not installed** on the account — only
OAuth-authorized, which grants identity and no write access. Installing it on
`anthonym71/securetotalscan` resolved every 403. Verified by pushing this
branch, and separately by pushing a commit touching `.github/workflows/cd.yml`
on a throwaway branch — so the `workflows` permission is confirmed present and
**PR 2.1 will not stall on it**. Scratch branch deleted.

**CI:** Repository Dependency Graph enabled. The `Review dependencies` check on
PR #106 was re-run and now passes; all seven checks green.

**Railway — backend restored after a two-month outage.** Root cause was three
stacked configuration faults, none visible from the repository:

1. Service **Config File** was `/backend/railway.toml` while **Root Directory**
   was `/backend`, so Railway resolved `backend/backend/railway.toml` and failed
   at "Snapshot code" in 2 seconds, before building. Dead since 2026-06-14.
2. A Railway trial expiry landed on top on 2026-08-15 (`Your trial has expired`
   in the CD log) and masked the first fault. Cleared by the Hobby plan.
3. With the config path corrected, **Root Directory** `/backend` then failed in
   the opposite direction — CD uploads from inside `backend/`, so the snapshot
   root *is* the backend folder and there is no `backend/` inside it. Cleared
   the field.

Settings now: Root Directory **empty**, Config File **`railway.toml`**.

**Verified:** deploy successful and online; `GET /health/trivy` returns
`{"available":true,"binary":"/usr/local/bin/trivy","db_ready":true,"message":"Trivy CVE scanning enabled"}`.
Trivy binary present and CVE database downloaded. Checked in a browser — this
session's egress policy blocks the Railway host (`CONNECT tunnel failed, 403`),
so the backend cannot be reached from the build environment.

**Consequence worth recording:** commit `147d439` (2026-08-15, shared-secret
auth between the Vercel proxy and Railway) had **never been deployed** before
today. Setting `AGENT_SERVICE_TOKEN` / `STS_SERVICE_TOKEN` against the previously
running code would have had no effect.

**Defect found, now PR 0.4:** `scripts/sync-railway-env.sh` runs
`railway up --detach`. The CD job reported success in one second on every run,
including runs where Railway then failed. That is why a two-month outage went
unnoticed.

**Open:** whether Railway's own GitHub auto-deploy is still enabled alongside
CD. Two deploy paths on one service race each other.

---

## 2026-08-17 — Phase 0 (planning, decisions recorded)

**Code:** `docs/PR-PLAN.md` updated to record Anthony's decisions. No product
code, configuration or dependency changes.

**Decisions (Anthony, 2026-08-17):** all three §3 sequencing changes approved;
Neon Postgres for PR 2.1; `send.` transactional and `outreach.` reserved for
PR 2.5; breaking Dependabot majors deferred post-launch with `openai` (#105)
pinned until after Phase 0.5; GitHub App `workflows` permission to be granted;
`pay.securetotalscan.com` moved from Phase 6 to Phase 2.

**Plan changes:** new PR 2.7 (`phase2/branded-checkout`); Phase 6.1 reduced to
branding verification with no DNS change; new §2.1 recording the three
repository access prerequisites; PR count 29 → 30.

**Flagged for decision:** the LLM-path freeze should extend from `openai` to
`langchain`, `langchain-openai` and `langgraph` (#101, #103, #104), which sit
on the same measured code path and would invalidate the Phase 0.5 cost
baseline.

**GHL:** No change. **Infrastructure:** No change. No DNS record touched, no
environment variable set, no deployment triggered.

**Verified:** PR #106 CI — six checks pass; `Review dependencies` fails because
the repository Dependency Graph is not yet enabled.

**PRD version resolved:** **v1.2** is the source of record, supplied
2026-08-17. Two earlier copies carried a stale `v1.0` title. Verified by diff:
v1.2's body is identical to those copies apart from the §6 amendments block,
which restates this plan's own §3 proposals. No requirement was planned against
outdated text.

**Approved (Anthony, 2026-08-17):** all four amendments listed in PRD v1.2 §6 —
Phase 0.5 inserted, scan recording in PR 2.2, retention enforcement moved to
Phase 4, and `pay.securetotalscan.com` moved to Phase 2. That section's "not yet
confirmed by Anthony" caveat is spent and the phase order in this plan governs.

---

## 2026-08-17 — Phase 0 (planning)

**Code:** `docs/PR-PLAN.md` and this changelog added. Plan authored by Claude
Code; repository claims independently re-verified by Viktor before this PR was
opened (PR #97's committed conflict markers, the open-PR count, the `cd.yml`
environment-variable sync trap and the `/dashboard` middleware prefix all
confirmed). No product code, no
configuration and no dependency changes.

**GHL:** No change. No object created, renamed or deleted.

**Infrastructure:** No change. No DNS record touched. No environment variable
set. No deployment triggered.

**Verified against `master` @ `eb00940`:**

- Free `/api/scan` returns the complete `ScanReport`, including every
  `fixPrompt` — the paywall is client-side only today.
- Hero "Get Pro — $49/mo" links directly to the GHL checkout rather than to
  the pricing section.
- `ScanForm` uses `type="url"`, so bare domains are rejected in the browser
  even though the server's `normalizeTarget()` accepts them.
- "Open the agent dashboard →" points at `/dashboard`, which `middleware.ts`
  protects; with `STS_ACCESS_CODES` unset, every visitor is redirected to
  `/login`.
- No HTTP-posture check exists: `checkSsl()` only reports when the target
  itself was requested over `http:`, plus a mixed-content regex.
- No persistence of any kind; runtime dependencies are exactly `next`,
  `react` and `react-dom`.
- Pricing shows three tiers (Free / Pro $49 / Organization); five are required.
- PR #97 is blocked by more than the missing Upstash configuration: it carries
  unresolved merge-conflict markers committed into `docs/ACCESS_CONTROL.md`
  and is based on a stale `master`.
- 20 pull requests are open against `master`: 19 from Dependabot (several of
  them breaking major upgrades) plus PR #97.

**Still missing:** everything in PRD §5. Implementation has not begun and is
awaiting phase-by-phase approval.
