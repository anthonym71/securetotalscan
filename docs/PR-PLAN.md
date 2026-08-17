# Secure Total Scan — PR / phase delivery plan

**Derived from:** PRD v1.0 (Viktor, 2026-08-17) — the version header of the
source document Anthony supplied, re-confirmed 2026-08-17 against a second
upload that was byte-identical. An earlier edit changed this to "v1.2"; no
document carrying that version number has been produced. If one exists, this
plan has not been checked against it.
**Prepared by:** Claude Code — 2026-08-17
**Status:** Plan only. No product code has been written. Nothing here is
approved for implementation until Anthony signs off phase by phase.

This document turns the PRD's six phases into concrete pull requests against
`anthonym71/securetotalscan`, sequenced by real dependencies in the current
codebase. Where the PRD's ordering conflicts with what the code actually
requires, that is called out explicitly in §3 rather than silently changed.

---

## 1. Baseline verified in the repository (2026-08-17)

Checked against `master` @ `eb00940`, not assumed from the PRD.

| PRD claim | Verified in repo | Notes |
|---|---|---|
| Free scan returns all fix prompts | **Confirmed** | `app/api/scan/route.ts` returns the full `ScanReport`; `components/ScanResults.tsx` renders `finding.fixPrompt` for every finding |
| Hero CTA opens checkout | **Confirmed** | `components/Sections.tsx` — "Get Pro — $49/mo" links straight to `link.ifactoryusa.com` |
| Bare domains rejected | **Confirmed** | `ScanForm` uses `type="url"`; the server's `normalizeTarget()` already accepts bare domains, so this is purely a client-side block |
| Broken dashboard CTA | **Confirmed** | "Open the agent dashboard →" → `/dashboard`, which `middleware.ts` protects; with `STS_ACCESS_CODES` unset every visitor is redirected to `/login` |
| "No limits" / persistence copy is false | **Confirmed** | `lib/content.ts` — FAQ "No credit card, no limits"; `TRUST.body` "Nothing is persisted" |
| No HTTP posture check | **Confirmed** | `checkSsl()` only fires when the *target itself* was `http:`, plus a mixed-content regex. Nothing ever fetches the `http://` version of an HTTPS target |
| No persistence | **Confirmed** | No database client anywhere; `package.json` runtime dependencies are exactly `next`, `react`, `react-dom` |
| PR #97 blocked on Upstash | **Partly — worse than stated** | #97 also carries an **unresolved merge-conflict marker committed into `docs/ACCESS_CONTROL.md`** (`<<<<<<< HEAD` … `>>>>>>>`) and is based on a stale `master`. It needs a rebase and a fix, not just an env var |
| Pricing shows three tiers | **Confirmed** | `PLANS` in `lib/content.ts` = Free / Pro $49 / Organization. Five tiers required |

### Two things the PRD does not mention that will shape the work

1. **The repo has zero runtime dependencies.** Persistence, PDF generation,
   email and real accounts each add a first runtime dependency. Every such
   addition passes through CodeQL, `dependency-review` and `security-audit`
   workflows, so dependency choice is a review item in its own right, not an
   implementation detail.
2. **20 open pull requests — 19 of them Dependabot**, including breaking majors (Tailwind 3→4,
   TypeScript 5→7, ESLint 9→10, LangChain 0.2→1.3, React group). They all
   target `master`. Left alone they will collide with every feature branch in
   this plan and keep CI noisy. Triage is cheap now and expensive later.

### Environment-variable trap (applies to every phase)

`.github/workflows/cd.yml` syncs a **fixed list** of secrets to Vercel and
Railway via `scripts/sync-vercel-env.sh` / `sync-railway-env.sh`. A new
variable added only in Vercel's UI is not in that list, and a new variable
added to the code but not to the sync script never reaches production. **Every
PR that introduces an env var must also update the sync script and the `cd.yml`
comment block, in the same PR.** This is a standing review checkpoint below.

---

## 2. Working rules for every PR in this plan

Derived from PRD §0.1, made concrete for this repo.

- One branch per PR, named `phase<N>/<slug>`, cut fresh from `master`.
- No direct pushes to `master`; no manual deploys. CD fires from CI on `master`.
- Every PR description states: **what changed / how it was tested / what is
  still missing / env vars Anthony must set (exact name + where)**.
- Every PR appends an entry to `docs/CHANGELOG-BUILD.md` (date, phase, code
  change, GHL change with object + ID, what was verified).
- Payments stay in **test mode** until Phase 6 sign-off.
- No copy may claim a feature that is not verified working in the same release.
- GHL: additive only. No deletion or rename of pipelines, workflows, contacts,
  products or DNS records without asking.
- DNS: never touch `MX`, SPF/`TXT`, or the `imap`/`mail`/`pop3`/`smtp` CNAMEs.
- Blocked by a platform limit → stop, report, provide the manual alternative.

### 2.1 Repository prerequisites (Anthony, 2026-08-17)

Three access items gate the programme. None involve product code.

1. **Dependency graph enabled.** The `Review dependencies` check on PR #106 is
   currently failing for this reason while every other check passes. Until it
   is on, `.github/workflows/dependency-review.yml` fails on every PR in this
   plan, so the failure carries no signal and a real dependency problem would
   be invisible. This is the single highest-leverage unblock.
2. **`contents: write`** for the GitHub App — without it no branch can be
   created and no commit pushed.
3. **`workflows: write`** for the GitHub App — separate from `contents`, and
   needed more often than it first appears. A push whose diff touches
   `.github/workflows/` is rejected **whole**, not partially, so any PR below
   that adds an environment variable is blocked without it:
   **0.3** (`ci.yml`, adds `verify:ratelimit`), **2.1** (`DATABASE_URL`),
   **2.5** (Resend keys), **2.6** (GHL webhook secret), **3.1** (auth secrets).
   PR **0.2** edits `.github/dependabot.yml`, which sits outside
   `.github/workflows/` and needs only `contents: write`.
   Worth proving on a scratch branch before Phase 0 rather than discovering it
   mid-PR.

---

## 3. Sequencing changes — all three approved (Anthony, 2026-08-17)

The PRD's phase order had three ordering problems. All three changes below are
**approved** and the PR table in §4 reflects them. The reasoning is retained so
the decision is auditable later.

**3.1 — Deep-scan cost must be measured before Phase 2, not in Phase 4.**
PRD §4 sets a decision gate: if a deep scan costs more than $0.50, the $4.99
tier must not include one. But the $4.99 tier ships in **Phase 2**, and the
measurement sits in **Phase 4**. As written, Phase 2 would ship a tier whose
scope is not yet decided. The backend already tracks per-session cost at
`/evals/{session_id}`, so measuring is a scripted run, not a build.
→ **Approved: insert Phase 0.5 (one PR) to measure, before Phase 2 scope is
frozen.** Full `docs/UNIT-ECONOMICS.md` still lands in Phase 4.

**3.2 — Scan persistence should start in Phase 2, for a Phase 5 feature.**
The peer-comparison chart (§5.8.3) may only use real recorded scans, hidden
below a 100-scan cohort. Nothing is recorded today. If recording starts when
Phase 5 begins, the chart ships permanently hidden.
→ **Approved: land scan recording early in Phase 2 (PR 2.2) so a cohort
accrues while Phases 3–4 are built.** No extra work, only ordering.

**3.3 — Retention enforcement cannot complete in Phase 2.**
PRD §5.7 requires expiry warning emails at 30/7 days and a durable deletion
job — both need the scheduler, which is Phase 4. Phase 2 can store and display
the expiry date honestly; it cannot enforce it.
→ **Approved: Phase 2 stores and shows expiry; Phase 4 enforces deletion and
sends warnings.** The Extended Archive product must not be sellable until the
enforcement job exists, or we would be charging for a retention change nothing
implements.

Two smaller notes:

- The Phase 1 dashboard preview must live at **`/preview`**, not
  `/dashboard/preview` — `middleware.ts` protects the whole `/dashboard`
  prefix, so a preview under it would redirect prospects to `/login`, which is
  the exact bug being fixed.
- Adding the HTTP posture check changes scores, which will move the self-scan
  grade and the `verify:scanner` expectations. That re-baseline belongs in the
  same PR as the check.

---

## 4. The PR plan

30 PRs across 8 phases. Each phase ends with a stop for approval.

### Phase 0 — Restore and verify infrastructure

| PR | Branch | Scope | Risk |
|---|---|---|---|
| **0.1** | `phase0/build-docs` | This plan + `docs/CHANGELOG-BUILD.md` + `docs/RUNBOOK-ENV.md` (every env var: exact name, where set, which sync script carries it). **Docs only, no product code.** | None |
| **0.2** | `phase0/dependabot-triage` | Triage the 19 open Dependabot PRs: merge safe patches, group the rest, **defer breaking majors** (Tailwind 4, TS 7, ESLint 10) to a post-launch window per Anthony's decision. **Freeze the LLM code path until Phase 0.5 is measured** — see the note below the table. Tighten `.github/dependabot.yml` grouping. | Low; unblocks everything after it |
| **0.3** | `phase0/ratelimit-fail-closed` | Finish PR #97: rebase onto current `master`, **remove the committed conflict markers in `docs/ACCESS_CONTROL.md`**, wire `verify:ratelimit` into CI. Merge **only after** Upstash is live in Vercel production — merging first makes every rate-limited route return 503. | Medium — ordering matters |
| **0.4** | `phase0/baseline-evidence` | `docs/BASELINE-2026-08.md`: recorded self-scan grade, `/health/trivy` result, authenticated agent-proxy round trip, Railway redeploy confirmation. Evidence, not claims. | None |

**Note on the dependency freeze (PR 0.2).** Anthony's decision is to pin
`openai` (#105) until after Phase 0.5. That pin is right, and on the same
reasoning it is incomplete: **#101 `langchain-openai`, #103 `langchain` and
#104 `langgraph` sit on the same measured code path.** `incident_response.py`
reaches GPT-4o through the LangChain/LangGraph stack, so a major bump to any of
those four changes token accounting, retry behaviour or prompt assembly — and
would invalidate a cost baseline measured before it. **Recommend freezing all
four until Phase 0.5 records its numbers**, then taking them together as one
reviewed batch with a re-measurement. Flagged rather than applied: it extends
Anthony's decision, so it needs his yes.

**Anthony's manual actions (blocking):** Railway Hobby redeploy; set
`AGENT_SERVICE_TOKEN` (Vercel) == `STS_SERVICE_TOKEN` (Railway), 32+ chars;
create the Upstash Redis database and set both `UPSTASH_*` variables; set a
temporary `STS_ACCESS_CODES` value so the dashboard can be exercised.

**Exit:** backend online, deep-agent proxy reachable by an authenticated user,
baseline grade recorded, CI green with no conflict markers on any open branch.

### Phase 0.5 — Deep-scan cost measurement *(recommended insert, §3.1)*

| PR | Branch | Scope | Risk |
|---|---|---|---|
| **0.5** | `phase0/cost-measurement` | Script to run a fixture set of deep scans and export per-run tokens, USD, duration and peak Railway RAM from `/evals`; publish first findings as `docs/UNIT-ECONOMICS.md` (draft). | Low; consumes OpenRouter credit |

**Exit:** a median and p95 cost per deep scan exists as a number, so the $4.99
tier's scope can be decided rather than assumed.

### Phase 1 — Truthful pricing and immediate UX

| PR | Branch | Scope | Risk |
|---|---|---|---|
| **1.1** | `phase1/pricing-tiers` | Hero CTA scrolls to `#pricing`; `PLANS` rewritten to the five tiers of PRD §3 with exact inclusions/exclusions, no-rollover wording, `$49/month` (never `$49.99`); Organization → contact sales. `lib/content.ts`, `components/Sections.tsx` | Low |
| **1.2** | `phase1/scan-input` | Protocol selector defaulting to HTTPS; accept bare domains (drop `type="url"`, mirror `normalizeTarget()` client-side while the server stays authoritative); carry the scan email into the report form, pre-filled and editable. | Low |
| **1.3** | `phase1/http-posture` | New probe fetching the `http://` origin: does HTTP respond, does it redirect to HTTPS, is HSTS present (with `max-age`/`preload`), mixed-content risk. Scored findings. Includes the score re-baseline and updated `verify:scanner` expectations. | **Medium** — changes grades for every target, including our own |
| **1.4** | `phase1/truthful-claims` | `/preview` read-only mock dashboard replacing the broken CTA; remove "no limits"; reconcile GitHub-repo wording (the free scanner does not scan repos); remove "Your report is on its way" until delivery is real; interim honest persistence wording (full rewrite lands in Phase 2 with actual storage). | Low |

**Exit:** nothing on the site promises a feature that does not exist.

### Phase 2 — Persistence, server-side paywall, reports

The largest phase. Seven PRs, deliberately small.

| PR | Branch | Scope | Risk |
|---|---|---|---|
| **2.1** | `phase2/db-foundation` | **Neon Postgres** (decided 2026-08-17) + migration tooling + schema only: `customer`, `subscription`, `site`, `scan`, `report`, `purchase`, `event_log`. `DATABASE_URL` added to `cd.yml` **and** `scripts/sync-vercel-env.sh`. No behaviour change. | **High** — first runtime dependency; needs `workflows: write` |
| **2.2** | `phase2/scan-persistence` | Record every scan (target, grade, score, findings JSON, cost, `created_at`, `expires_at` = +6 months). Starts the peer-comparison cohort (§3.2). | Medium |
| **2.3** | `phase2/server-side-paywall` | Split the report type into public vs premium. `/api/scan` returns grade, score, finding titles + severities, and exactly **one** medium-severity sample prompt. Premium prompts served only from an entitlement-checked route. Adds a CI verify script asserting no premium prompt appears in the free payload, page source or RSC stream. | **High** — hard review item; type change ripples through `ScanResults` and `verify:scanner` |
| **2.4** | `phase2/report-pdf` | Branded PDF: target, timestamp, grade/score, findings with evidence, prompts per entitlement, HTTP/HTTPS posture section, methodology and limitations. Authenticated download route. | Medium — must fit Vercel's function limits |
| **2.5** | `phase2/email-delivery` | Resend wiring on **`send.securetotalscan.com`** (transactional), **plus `outreach.securetotalscan.com` reserved and documented** for Phase 7 (PRD §10.7 — retrofitting sender separation after a reputation problem is expensive). Both subdomains decided 2026-08-17. Exact DNS records documented for Anthony; MX/SPF untouched. Deliverability evidence for Gmail, Outlook and one corporate domain. | **High** — DNS adjacent to live email |
| **2.6** | `phase2/ghl-entitlement-webhook` | Webhook-verified entitlement grant bound to (scan, customer) — never a redirect to a success URL. CRM tags and pipeline moves. Retention/privacy copy rewritten to match what is now actually stored, with expiry dates shown. | **High** |
| **2.7** | `phase2/branded-checkout` | **Moved here from Phase 6** (Anthony, 2026-08-17). `pay.securetotalscan.com` branded checkout domain; apex and `www` stay on Vercel; payment link renamed from "New Link"; customer-visible branding standardised to "Secure Total Scan". Exact DNS record documented; email records untouched and mail verified after. Lands after 2.6 (products and links must exist to brand). | **High** — DNS |

**Why the branded domain moves to Phase 2.** The first paid tier ships in this
phase. Left in Phase 6, every customer of the $1.99 and $4.99 tiers would pay
through `link.ifactoryusa.com` for the whole life of Phases 2–5 — an unfamiliar
domain at the exact moment a first-time buyer decides whether to trust us, on
the product whose entire pitch is web security. Moving it also **batches all
three DNS additions — `send.`, `outreach.` and `pay.` — into one documented
change window** on a zone that carries live email, so mail is verified once
after a single reviewed set of records rather than on two separate occasions.

**Anthony's manual actions:** create the GHL one-time products and payment
links; add the documented DNS records for `send.`, `outreach.` and `pay.`;
configure the GHL branded domain; provide the webhook signing secret.

**Exit:** a paid customer receives a real PDF in a real inbox; a free visitor
cannot extract premium prompts from the API, page source, RSC payload or any
network call.

### Phase 3 — Accounts, allowances and Pro

| PR | Branch | Scope | Risk |
|---|---|---|---|
| **3.1** | `phase3/accounts` | Real per-customer accounts replacing shared `STS_ACCESS_CODES` (email magic link over the Phase 2 mailer, reusing the existing signed HttpOnly session cookie). | High |
| **3.2** | `phase3/credit-ledger` | Scan-credit ledger (10 / 100), monthly reset on the subscription anniversary, no rollover, confirmation before a credit is spent, hard stop at zero with an upgrade CTA — never a silent failure. | Medium |
| **3.3** | `phase3/sites-and-dashboard` | Saved sites (add, label, group, remove), per-site history, grade trend, reports list, real dashboard. `/preview` stays as the marketing demo. | Medium |
| **3.4** | `phase3/lifecycle-and-isolation` | Subscription lifecycle: activate, cancel, failed payment, refund/chargeback → revoke or downgrade. Plus an explicit tenant-isolation test suite (customer A must not read B's sites, scans or reports) as a named review item. | **High** |

**Exit:** a test subscriber can log in, add sites, spend credits, and lose
access on cancellation.

### Phase 4 — Monitoring, retention enforcement and economics

| PR | Branch | Scope | Risk |
|---|---|---|---|
| **4.1** | `phase4/scheduler` | Durable monthly scheduler (Railway cron or a persisted queue — not in-process timers; FastAPI sessions are in-memory and lost on restart). Survives a backend restart. | High |
| **4.2** | `phase4/notifications-and-expiry` | Completion emails; escalated alerts on grade drop or new critical/high. Retention enforcement moved here per §3.3: 30-day and 7-day expiry warnings with a free download link, permanent logged deletion, Extended Archive ($1.99 → 12 months) becoming purchasable **only now**. | High |
| **4.3** | `phase4/unit-economics` | `docs/UNIT-ECONOMICS.md` finalised from ≥20 measured deep scans: median and p95 cost, cost per surface scan, Railway cost per 100 scans, gross margin at $4.99/$19/$49 after a blended ~60% US / ~40% EU-UK Stripe fee. Confirm or revise the $4.99 deep-scan inclusion against the $0.50 gate. Abuse guards: concurrency cap, repo size/file caps, per-hour cap inside an allowance. | Medium |

**Exit:** monitoring runs unattended after a restart; margins are evidenced.

### Phase 5 — Visual system, animation and gamification

Concepts only from isitsecure.ai. No copying of its layout, components, copy,
chart designs or dark-purple/gold aesthetic; its radar chart, grade rail and
stacked benchmark bar are explicitly off-limits as designs.

| PR | Branch | Scope | Risk |
|---|---|---|---|
| **5.1** | `phase5/design-foundation` | Motion and design tokens, `prefers-reduced-motion` support, contrast and keyboard-navigation baseline, performance budget (no animation may delay first meaningful paint). | Medium |
| **5.2** | `phase5/vulnerability-map` | Animated, data-driven category map (not a spider/radar) plus the improvement projection: current vs achievable posture with the delta attributed to specific findings. | Medium |
| **5.3** | `phase5/scan-theatre` | Staged progress driven by **real scanner events**, findings landing as discovered, severity escalations, attack vignettes tied to actual findings only. Optional sound: off by default, persistent mute/volume, stored preference, never autoplayed. | Medium |
| **5.4** | `phase5/peer-comparison` | Comparison driven solely by scans recorded since Phase 2. Hidden below a 100-scored-scan cohort ("building benchmark data"); sample size and date range always displayed. No seeded, estimated or hardcoded benchmark. Restrained gamification: grade progression, A-streaks, fix completion, shareable card. | Medium — may ship hidden if the cohort is small |

**Exit:** distinctive, professional, fast, accessible, and visibly unlike
isitsecure.ai.

### Phase 6 — GHL completion, QA and go-live

| PR | Branch | Scope | Risk |
|---|---|---|---|
| **6.1** | `phase6/branding-verification` | **Verification only** — the branded checkout domain itself now ships in PR 2.7. Confirm `pay.securetotalscan.com` still resolves to GHL, apex and `www` still serve the app, mail still flows, and branding reads "Secure Total Scan" consistently across all five tiers and every customer-visible surface. Fix any drift. | Low — no DNS change, only checks |
| **6.2** | `phase6/qa-matrix` | Full journey QA across all five tiers on mobile and desktop; failure, cancellation and revocation tests; deliverability re-test; fixes arising. | Medium |
| **6.3** | `phase6/release-gate` | Acceptance-test evidence pack against PRD §7, self-scan back to **A** as a release blocker, documented rollback procedure. | Medium |

**Then, outside a PR:** one small real charge and refund in live mode, and the
test → live switch **only on Anthony's explicit approval**.

**Exit:** launch-ready with a documented rollback.

### Phase 7 — Outbound (explicitly out of launch scope)

Not planned here beyond the one Phase 2 obligation: the separate outreach
sending subdomain is reserved and documented in PR 2.5. Nothing in Phases 0–6
is delayed or complicated for outreach.

---

## 5. Standing review checklist (every PR)

1. Any new env var is in the code, `scripts/sync-*-env.sh` **and** the `cd.yml`
   comment block.
2. `docs/CHANGELOG-BUILD.md` updated, including GHL object IDs where relevant.
3. No secret in the diff; no secret in a log line.
4. No copy claiming an unshipped feature.
5. CI green: typecheck, build, `verify:scanner`, backend pytest.
6. Where the PR touches premium content: proof that the free payload is clean.
7. Where the PR touches customer data: proof that queries are scoped to the
   owning customer.

---

## 6. Decisions — resolved and outstanding

### Resolved (Anthony, 2026-08-17)

| # | Decision | Effect |
|---|---|---|
| 1 | **All three §3 sequencing changes approved** | Phase 0.5 inserted; scan recording lands in PR 2.2; retention enforcement moves to Phase 4 |
| 2 | **Neon Postgres** | PR 2.1 unblocked |
| 3 | **`send.` transactional, `outreach.` reserved** | PR 2.5 unblocked |
| 4 | **Defer breaking majors post-launch; pin `openai` (#105) until after Phase 0.5** | PR 0.2 unblocked — see the extension flagged under Phase 0 |
| 5 | **GitHub App `workflows` permission** | Unblocks PRs 0.3, 2.1, 2.5, 2.6, 3.1 — see §2.1 |
| 6 | **`pay.securetotalscan.com` moves from Phase 6 to Phase 2** | New PR 2.7; Phase 6.1 becomes verification only |

### Outstanding

1. **Extend the LLM-path freeze** from `openai` alone to `langchain`,
   `langchain-openai` and `langgraph` (#101, #103, #104) for the duration of
   Phase 0.5. Reasoning under Phase 0 above. *(Blocks: PR 0.2 scope.)*
2. From PRD §9, unchanged: confirm the $4.99 deep-scan inclusion once Phase 0.5
   reports; confirm Organization is contact-sales only at launch; legal
   sign-off on the Extended Archive terms before go-live.

---

## 7. What this plan deliberately does not do

- It does not write product code. Phase 0.1 ships documentation only.
- It does not touch GHL, DNS or any production environment.
- It does not assume the state left by any earlier session still exists; every
  phase re-verifies the live state before changing anything.
