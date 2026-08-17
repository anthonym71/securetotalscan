# Build changelog

Required by PRD v1.2 §0.1.8. Every change gets an entry: date, phase, what
changed in code, what changed in GHL (object + ID), what was verified.
Newest first.

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
