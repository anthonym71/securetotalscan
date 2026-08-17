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

## 2026-08-17 — Phase 1, PR 1.0 (dashboard findings render as text, not JSON)

**Code:** new `lib/findings.ts`, new `scripts/verify-findings.ts` (wired into
`verify:scanner`), `app/dashboard/page.tsx` `FindingList` updated.

**The defect was wider than first recorded.** The 2026-08-17 entry below notes
that deep-analysis *vulnerabilities* rendered as `JSON.stringify(item)` because
`FindingList` never consulted `name`. Checking each agent's real output shows
**three** of the seven shapes the backend can emit were landing in that
fallback, not one:

| Shape | Source | Keys | Rendered before |
|---|---|---|---|
| Code finding | `tools/github_scanner.py` | `category`, `name`, `severity`, `recommendation`, `file`, `line`, … | **raw JSON** |
| OWASP vulnerability | `agents/vuln_scanner.py` | `category`, `name`, `severity`, `recommendation`, `linked_anomaly` | **raw JSON** |
| Missing header | `agents/vuln_scanner.py` | `header`, `severity`, `recommendation`, `fix_prompt` | **raw JSON** |
| Docker CVE / metadata | `tools/docker_scanner.py` | `name`, `severity`, `description` | correct |
| Log anomaly | `tools/log_parser.py` | `type`, `source_ip`, `severity` | correct |
| Compliance gap | `agents/policy_checker.py` | `framework`, `control_id`, `description` | correct |

Code findings are the *repository scan* — the headline feature of a GitHub deep
analysis — so the most valuable output of the most expensive scan was the part
displayed as a JSON blob.

The missing-header shape has no label key at all, so `name` alone would not
have fixed it; a label is composed from `header`.

**Also surfaced:** `recommendation`, present on every code finding, OWASP
vulnerability and header finding, and never displayed. The agents were writing
remediation advice the customer could not see. Plus line numbers on file
locations, and CVE ids / OWASP categories as a meta tag.

**Docker CVEs keep their existing behaviour on purpose:** `description` stays
ahead of `name` in the chain, because "Out-of-bounds write in zlib MiniZip" is
a better headline than "CVE-2023-45853". The identifier is not lost — it moves
to the meta tag.

**Why the logic left the component.** It is now a pure module with 44 checks
run by CI on every PR, each fixture copied from the agent that emits it rather
than invented. The original bug was not a logic error but a shape nobody had
checked the renderer against, so the fix has to be a test against every real
shape. Raw JSON remains as a deliberate last resort — visibly wrong is better
than an empty row, and it signals that a new agent shape needs adding.

**Verified:** `npm run typecheck` clean; `npm run build` succeeds;
`npm run verify:scanner` passes including the 44 new checks.

**Sequencing:** done before PR 1.4, so the Phase 1 `/preview` dashboard mirrors
a fixed component rather than inheriting the bug.

**GHL:** No change. **Infrastructure:** No change.

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
