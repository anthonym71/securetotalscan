
## 2026-10-08 — Commercial core and customer durability advanced

**Engine:** ChatGPT. **Master:** `b58ca601ed78823cfdcdadd7877959bebdd6c2a7`.

Verified/merged during launch push: five-tier pricing and commercial core, signed HighLevel paid-event intake, customer/subscription records, magic-link auth, scan credits, billing lifecycle hardening, saved sites/history, tenant isolation, monitoring, retention, paid surface-report email trigger, and sanitized paid deep-report persistence. CI, CodeQL and Security Audit pass on current master. Railway production remains online. Railway's competing GitHub source was pinned to current master so GitHub CD remains the moving release authority. Six bounded cost runs completed successfully, but reported zero tokens/cost; this is recorded as an instrumentation gap rather than zero-cost proof.

**External blockers:** HighLevel Products/Payments authorization returns 401; Resend provider verification remains; checkout/product mapping awaits live provider identifiers; historical Slack webhook revocation remains unverified; final paid end-to-end production journey remains pending.

**NEXT:** finish current Vercel CD, then consume Claude/provider-console evidence and complete final live purchase-to-account acceptance.

---
# Build changelog

Required by PRD v1.2 §0.1.8. Every change gets an entry: date, phase, what
changed in code, what changed in GHL (object + ID), what was verified.
Newest first.

---

## 2026-10-08 — Service-auth deployment sync hardened

**Engine:** ChatGPT orchestration. **Branch:** `fix/service-auth-sync-2026-10-08`.

CD already deployed the current release successfully, but the canonical environment sync omitted the two service-to-service authentication variables that protect the deep-agent path: `STS_SERVICE_TOKEN` on Railway and `AGENT_SERVICE_TOKEN` on Vercel. Both had previously been configured manually and the handshake was verified, but a future environment rebuild or replacement could silently drop them.

**Change:** wire `STS_SERVICE_TOKEN` through the Railway deploy job and `scripts/sync-railway-env.sh`; wire `AGENT_SERVICE_TOKEN` through the Vercel deploy job and `scripts/sync-vercel-env.sh`; update the CD source-of-truth comments accordingly. No token value is logged or committed.

**GHL / DNS / payments:** no change. **Release gate:** normal CI/security review, then merge so the next CD run reasserts both auth variables from the GitHub `prod` environment.

---

## 2026-10-08 — Repository-audit repair released to production

**Engine:** ChatGPT orchestration + GitHub CI/CD. **Release commit:** `39c40b43c327d16cc58a19492802000c920fd72c`. **PR:** #156.

The repository-audit repair is merged and deployed. It removes the silent 60-file sample, inventories supported files at an immutable commit, separates successful reads from exclusions/failures, marks bounded or interrupted work incomplete, fixes the reviewed false-positive contexts, redacts credential evidence, removes duplicate finding presentation and replaces unsupported compliance scoring with **Not assessed**.

A Python f-string regression in the original PR head was repaired before merge. Newly published dependency advisories were also handled before release: the lock now carries Next.js 15.5.27, Sharp 0.35.5, source-map-js 1.2.2 and PostCSS 8.5.28. The remaining high `braces` advisory is in a dev-only dependency and currently has no patched release; production dependencies remain a blocking audit gate while the complete audit is still reported.

**Verified:** PR exact-head CI passed; master CI passed; CodeQL passed; production-dependency Security Audit passed; Dependency Review passed. Full-history Secret Scan still reports exactly the already-recorded historical Slack-webhook fingerprint and no new secret. CD run 37709084769 passed both production legs: Railway deployed and passed post-deploy backend health verification; Vercel synced configuration, applied database migrations, passed the live storage check and deployed successfully.

**GHL / external changes:** none in this release. The September 29 HighLevel and Resend read-only audit remains the latest provider evidence and returned HTTP 401 for both providers. No payment, customer message or DNS mutation was performed in this release.

**Remaining release truth:** this closes the repository-audit production repair, not the whole commercial roadmap. Exact five-tier pricing, authorized provider access, payment-verified entitlement, real customer accounts/credits, email delivery, lifecycle, monitoring/retention completion, refreshed large-audit economics and full launch QA remain open. A post-deployment authenticated >60-file run still needs an authorized automation credential; authentication was not weakened merely to obtain that receipt.

---

## 2026-10-01 — Audit coverage and reporting repair (in review)

**Engine:** Codex orchestration, three isolated builder worktrees and an independent reviewer. **Base:** 6b664bd. **Objective:** remove the silent 60-file sample and fix misleading detection/report claims before paid use.

The owner replaced `GIT_TOKEN` in the existing GitHub prod environment. Railway job 110487653914 in CD 36640879372 synced it and deployed successfully. A live authenticated scan of our own public repository reported 60 selected files, 12 candidate findings and no credential error. Review then established that the count was capped and could include failed reads; findings confused regex matching, comments, fixture secrets and detector text with vulnerabilities. The associated critical rating and 45% compliance were not evidence-backed security conclusions.

**Repair acceptance:** immutable commit inventory, no 60-file cutoff, successfully decoded file counts, complete accounting for exclusions and failures, bounded resources with explicit incomplete status, language/context-aware candidates, real-positive regression cases, redacted credential evidence, no duplicate finding lists, no compliance percentage, and conditional evidence-based recommendations. A source coverage receipt is not a penetration test or certification. Private repositories are not accessed through the app-wide public scan token.

**Current verification:** final integrated audit changes passed 306 backend tests, full web verification, typecheck and production build. The independent reviewer reproduced and checked fixes for fixture misclassification, credential snippets, unbounded finding output and quadratic lexical lookups. A speculative Neon SQL-tag exemption failed review and was removed: uncertain tagged SQL remains reviewable. Independent review passed with documented non-blocking scope limitations. Exact final CI and live deployment checks are pending; this entry does not claim release.

**CI dependency repair:** the initial PR audit found three brace-expansion denial-of-service advisories (GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p) affecting the locked5.0.9 version. Update the existing override minimum and lockfile to5.0.12; preserve unrelated platform metadata. No new package introduced. Audit/build verification is rerun on this patched head.

**Configuration/external changes:** no new secrets, migrations, payments, GHL objects, DNS or customer messages. Existing credentials and deployment workflow reused. Historical Slack webhook exception stays open and unsuppressed. Rollback is a normal revert through CI/CD. Broader commercial launch remains blocked by pricing, payment/customer lifecycle, email credentials/delivery, monitoring and retention cleanup.

**NEXT:** finish independent review, integrate fixes, run exact tree regressions, publish PR, verify CI/CD and live source coverage beyond 60 files. Very large or unsupported repositories must show limits/incomplete coverage; future durable queued audits require separate architecture and cost validation before claiming unlimited audits.

---

## 2026-09-29 — Storage and secure PDF release: live verification

**Milestone status: CONDITIONALLY CLOSED** for scan storage, server-side prompt projection and secure PDF downloads. **Full commercial launch: BLOCKED**, not complete.

PR153 merged as 3033b0b; PR154 merged as 92013f693c15f45cfd5ed23b540b813bbe469ebd. Exact PR154 head db1a547 passed CI (web/backend), CodeQL, Security Audit and Dependency Review. Secret Scan reports exactly the previously accepted historical Slack webhook fingerprint, no new findings or suppression. CD36641707562 deployed Vercel successfully, including real Neon insert/readback/retention/atomic-cleanup gate; Railway correctly skipped because backend was unchanged.

Live checks after deployment: self-scan returned HTTP200, **A / 100**, and confirmed saved storage; free PDF returned a valid PDF (6,847 bytes); missing/wrong tokens returned401; anonymous premium JSON returned403; owner login returned200; owner premium JSON and PDF returned200; member cookie without the report capability still returned401. No report tokens, cookies or signing keys were printed or saved to files. The test scanned our own site under the owner's supplied email using the normal scan/CRM flow. No report email or payment was sent.

Remaining: exact five-tier specification, payment-verified entitlement and lifecycle, verified customer accounts/credits, email delivery, monitoring, automatic deletion and full launch QA. Retention expiration is enforced on reads; physical deletion is still unfinished. Historical webhook exception remains open. Rollback is a normal revert of PR154/153 through CI/CD; no schema migration was introduced by either PR.

**Next verification:** A separate, read-only integration-readiness workflow uses existing prod credentials against fixed HighLevel/Resend provider hosts. It reports only HTTP status, first-page product count, expected sender-domain match and verification booleans. No credentials, customer data or product metadata are printed. It sends no messages, makes no payment/DNS changes and does not alter provider accounts. Local syntax and missing-configuration paths checked; actual provider results are pending. Provider success must not be inferred merely from a successful diagnostic job.

---

## 2026-09-29 — Secure report downloads and server-side prompt projection

Reused the public-report projection and dependency-free PDF renderer from the unmerged `claude/sts-phase-0-continuation-154ndo` branch (head 7376cd7), adapting them to current security fixes and verified persistence. Did not adopt its UUID-only report access or shared-member cross-report access.

**Code:** Free API responses and PDFs contain at most one medium-severity prompt. Full prompts require current valid membership. Reports require a scan-specific HMAC bearer capability in an Authorization header; scan A's token cannot access B, and membership cannot bypass that check. Tokens are issued only for saved reports with a strong signing secret, never persisted or put in URLs. Reads expire, are rate limited, and return sanitized errors. The result page downloads the actual stored report as a branded PDF. Existing auth, DNS/request guards and quotas stay in force.

**Verification:** Local typecheck, production build and lint pass (one existing font warning). PDF checks prove withheld prompt text is absent, member prompts present, xref/stream integrity, pagination and escaping. Token/read tests cover cross-scan refusal before database access, invalid/expired records, rotation and limits. A generated report was rendered and visually inspected. Final exact-head CI and deployment are still required. No production PDF success is claimed here.

**Earlier milestone:** PR #153 merged as 3033b0be450422e30045c335b60b7f5142e7fda0. CD 36640879372 passed both deployments. Its real Neon gate passed insert/readback, six-month retention, anonymous ownership and atomic cleanup. Owner login works per Anthony's correction.

**Configuration / external changes:** Reuses existing STS_AUTH_SECRET and DATABASE_URL. No new secrets, schema, GHL, DNS, messages or payments. Paid checkout, exact five-tier pricing, real accounts/credits, emailed reports and monitoring remain unfinished. The old execution plan on the recovered branch independently confirms the pricing-table dependency.

---

## 2026-09-29 — Storage deployment gate and login correction

Anthony clarified that owner login **is working** (user-confirmed, not an independent live sign-in test). It is no longer a blocker. Full local web verification now passes after updating the obsolete schema-only assertion that prohibited the new scan writer. CD adds a real Neon gate: the same insert statement as the runtime, report readback, six-month retention/anonymous ownership assertions, and removal of the synthetic row in one atomic transaction. It logs only pass/fail, never database credentials or error objects. A failed SQL transaction rolls back; a successful transaction leaves no fixture behind. This gate must pass before the frontend deploys. No new secrets or schema changes.

---

## 2026-09-29 — Commercial build resumed: scan persistence and truthful availability

Engine: ChatGPT / Codex. Branch: `phase2/scan-persistence-2026-09-29`, based on `b24ffd00717bc0fff4189a0b984b1d7f1d64c171`. Anthony authorized continuing the commercial build while parking the owner-login issue.

**Code:** Surface reports are written to the existing Neon scan table using bound parameters and a five-second storage timeout. The response includes the database receipt and six-month retention review date only after a successful write. Storage failure preserves the scan result with an explicit unsaved warning and a deduplicated operational alert. No submitted email is used to assign ownership; future account verification must establish that. Stored report strings remove URL credentials, query strings and fragments. Fetched page/bundle contents are not stored. There is no public read-by-ID route.

**Copy:** Remove the unverified purchase link and monitoring/PDF/SSO promises. Pro is marked in development; organization routes to contact sales. Hero compares plans. PDF interest registration no longer promises eventual delivery of an unstored prior report. Storage/privacy wording describes current limitations, including unfinished automated deletion and online history.

**Validation:** Typecheck, scan-storage regressions and existing claims checks pass. Lint passes with one existing font warning. Production build passed before the final timeout adjustment; exact-head CI remains required. Storage tests cover parameterization, URL redaction, non-mutation, unassigned ownership, receipt mapping, and write failures with a mock database. Real Neon insert/readback and live scan response remain UNVERIFIED. No deployment is claimed.

**GHL / configuration:** No GHL objects changed, no messages or payments sent. No new env variables. Existing DATABASE_URL and migration 0001 are reused; no existing migration changed. No DNS changes.

**Blockers / NEXT:** PRD v1.2 section 3 exact five-tier inclusions remains missing after repository, personal-context, public Slack and saved-file searches. Saved discussion contains an older $19 one-time proposal, which is not the later approved five-tier table and is not substituted. The deep-cost benchmark remains withdrawn. Owner login is still failing per user report; paused at their request. Payment entitlement, PDF/email delivery, accounts/credits, monitoring and launch QA remain unfinished. This PR is reviewable progress, not commercial launch completion.

---

## 2026-09-29 — Email-bound owner dashboard access

**Request:** Add separately configured owner access that is not tied to customer-plan expiration. Real email/code values are deployment settings only, never source or fixtures.

**Code:** `lib/auth/session.ts` verifies the configured owner email and separate access code before issuing an explicit owner session. An independent 32+ character `STS_AUTH_SECRET` is required. Owner sessions ignore customer `STS_ACCESS_EXPIRES` but retain the seven-day session lifetime, login rate limits and agent quotas. A keyed credential binding revokes owner cookies when the owner email/code is changed or removed. Customer labels cannot grant owner privilege. Owner login does not send CRM lead events. The existing `/login` and `/dashboard` routes are reused; this does not build a separate administration panel.

**Configuration:** New `STS_OWNER_EMAIL` and `STS_OWNER_ACCESS_CODE`; existing `STS_AUTH_SECRET` is required for owner access. All three are documented in `.env.example` and `docs/ACCESS_CONTROL.md`, and wired into the GitHub prod -> Vercel sync in `cd.yml` and `scripts/sync-vercel-env.sh`. Empty GitHub values preserve existing Vercel values. Owner access stays off until the three required settings exist. Preserve an existing strong signing secret, since rotating it also signs out customers.

**Verified locally:** Typecheck and lint pass (two existing lint warnings). Dedicated owner regression suite passes: missing/weak signing key fails closed, wrong email/code refused, case-insensitive email matching, customer expiry stays effective, owner bypasses only that expiry, forged role/payload refused, normal owner-session expiration retained, and credential changes revoke prior owner cookies. HTTP integration checks **14/14 passed** with synthetic credentials and a mock shared rate-limit store, including authenticated dashboard access, anonymous refusal, expired customer refusal and HTTP 429 on attempt 11. No real customer messages or credentials were used in tests. Current PR CI/build/security checks remain the release gate.

**GHL changes:** None. **Production owner setup:** Not yet performed or verified. Vercel settings currently require interactive sign-in; browser credential-change rules require the user to enter and submit new authentication credentials. This entry is implementation evidence, not a claim that the requested owner login is active.

The historical-webhook incident remains the previously accepted separate exception; its finding is not suppressed.

---

## 2026-09-29 — Security repair release: closure record

**Build / milestone:** SecureTotalScan dependency and application hardening release (#149, #148). This is separate from AMOS and from the wider commercial-launch phases in `docs/PR-PLAN.md`.

**Closure status:** CONDITIONALLY CLOSED — the security release is deployed and verified; the user-accepted historical webhook incident remains open.

### Acceptance checks

- **PASS / VERIFIED — source:** #149 merged as `968b1cfec87aaf7c7c7390417b81f4ceb0bf1e70`; #148 merged as `ffe9795b1d7462edee3d661a2742814c0691d504`. The tested local tree and published #148 head `bcd605ef045fe0fb47620a8067fa2f4ef1745fb9` have identical tree `efb119e87b3aa3ca3f509b13af3171c97060c038`. Normal GitHub merges, no force push or history rewrite. Existing unrelated image work was preserved.
- **PASS / VERIFIED — tests/build:** [production-branch CI](https://github.com/anthonym71/securetotalscan/actions/runs/36623524961) passed Web and Backend, including typecheck, lint, production build and scanner suites. Local backend: **225 passed**; web verification: **378 printed checks plus request-body assertions**; local API regression matrix: **12/12 passed**.
- **PASS / VERIFIED — dependency and static security checks:** [Security Audit](https://github.com/anthonym71/securetotalscan/actions/runs/36623524868) and [CodeQL](https://github.com/anthonym71/securetotalscan/actions/runs/36623524977) passed for the merge. PR dependency review also passed.
- **PASS / VERIFIED — deployment:** [CD run 36623647601](https://github.com/anthonym71/securetotalscan/actions/runs/36623647601) successfully deployed exact release commit `ffe9795` to both Vercel and Railway. Railway reported deploy complete and passed its post-deploy health check at 2026-09-29 20:09:32 UTC, with `available=true` and `db_ready=true`. A separate post-rollout probe at 20:10:08 UTC confirmed the same healthy state and HTTP 401 for an unauthenticated report request.
- **PASS / VERIFIED — live web and access boundaries at 2026-09-29 20:06:57 UTC:** 13/13 production probes passed, as detailed below. These are health and boundary checks, not a paid deep-agent run.
- **FAIL / ACCEPTED EXCEPTION — history secret scan:** [production-branch Secret Scan](https://github.com/anthonym71/securetotalscan/actions/runs/36623524974) scanned 134 commits and reported exactly **one** finding: the previously documented Slack webhook introduced in `de06dde`, `app/dashboard/page.tsx:53`. No new finding. The real-secret fingerprint remains unignored.

| Production probe | Verified response |
|---|---|
| Home, `/preview`, `/login` | HTTP 200 each |
| `/dashboard` without a session | HTTP 307 to login |
| Agent report proxy without a session | HTTP 401 |
| Backend report without service authentication | HTTP 401 |
| Backend `/health/trivy` | HTTP 200, `available=true`, `db_ready=true` |
| Scan: null body or wrong field types | HTTP 400 |
| Scan: oversized request | HTTP 413 |
| Scan: loopback target | HTTP 422 |
| Lead and login: null body | HTTP 400, new object-validation response |

### Blocking issues

None for this security release. The historical credential incident is explicitly excluded from the release blocker list by the user; it is not resolved or hidden.

### Non-blocking exceptions

Anthony explicitly authorized this release to proceed independently of the historical-webhook incident on 2026-09-29. The incident stays **OPEN** until permanent revocation is confirmed. A prior HTTP 404 `no_service` response does not establish permanent revocation; provider escalation remains pending. No secret was printed, reused or suppressed, and no private support receipt is published here.

Existing lint warnings (font placement and unused import) remain. Deployment reports the existing missing `DATABASE_URL_UNPOOLED` secret and uses the configured pooled database URL; this release adds no schema migration. Deployment also reports `ALERT_WEBHOOK_URL` absent from the GitHub production environment, so alert delivery is not certified by this record.

### Repairs performed

Dependency updates, lint configuration and CI enforcement, DNS-pinned web/backend connections and fail-closed private-network guards, redirect/body limits, GitHub/Docker path validation, default-disabled host-log access, UTF-8 cost reports, case-insensitive header checks, and bounded/type-checked API JSON. The affected tests and production-branch checks were rerun. Node minimum matches undici's requirement. No GHL or payment changes. Optional `STS_ALLOW_SYSTEM_LOGS` remains disabled by default.

### Evidence gaps / unknowns

Paid/authenticated end-to-end deep-agent execution and live alert delivery were not tested in this release. This record does not certify paid checkout, PDF/email delivery, individual customer accounts, scheduled monitoring, or completion of the wider product roadmap. No live payments or outbound customer messages were sent.

**Lifecycle record:** This canonical build changelog contains the release decision and evidence. Earlier dated status/review documents remain historical snapshots.

**Next trigger:** Provider revocation evidence closes the historical-secret incident through a separately reviewed update. New defects or changed production behavior require targeted re-verification; broader product phases remain separate work.

---

## 2026-09-29 — PR #148 hardening release review

Engine: ChatGPT / Codex. User instruction: continue and finish without waiting for the historical webhook issue. PR #149 is merged at `968b1cfec87aaf7c7c7390417b81f4ceb0bf1e70`; CI, CodeQL, Security Audit and production Vercel deployment run `36622822768` succeeded. That master was integrated into #148 with a normal merge.

Reviewed the DNS-pinned outbound transports, fail-closed DNS errors, per-hop redirect validation, IPv4/IPv6 private-range blocks, bounded response reads, GitHub/Docker input validation, and default-disabled host log access. Existing independent review R1-R9 fixes are present. Added regression repairs: HTTP header presence comparisons are case-insensitive; scan, lead and login JSON inputs are streamed with a 4096-byte cap and reject non-object bodies or non-string text fields; Node minimum now matches undici's 20.18.1 requirement. Tests are part of normal CI.

Verification on the integrated working tree: typecheck passes; lint has no errors and two existing warnings; all web verification suites pass (378 printed checks plus request-body regression assertions); backend pytest **225 passed**. Local HTTP smoke tests verify null, wrong field types and malformed JSON return 400, and oversized UTF-8 bodies return 413, on scan, lead and login (12/12). Full PR-head CI/build/security checks must finish before merge; production hardening deployment is not yet established here.

GHL changes: none. New environment variables in this release: optional `STS_ALLOW_SYSTEM_LOGS`, documented in `backend/.env.example`, default off; deliberately not enabled in production. No other new environment variables, infrastructure settings or payment changes.

Historical webhook incident remains OPEN. The prior endpoint returned HTTP 404 `no_service`; that is not proof of permanent revocation. Provider escalation is pending. Release proceeds under the user's explicit exception; the real secret fingerprint remains unignored, the full-history Secret Scan stays enabled, and git history is not rewritten. A failing Secret Scan is acceptable only if it reports exactly the already-documented historical webhook and no new secret. Normal GitHub merge rules remain in force.

Full commercial launch is not claimed: the repository's wider PR plan still includes persistence, payment entitlement, PDF/email delivery, individual accounts and monitoring. See `docs/PR-PLAN.md`; these are distinct from closing the reviewed security repair release.

---

## 2026-09-29 — PR #149 dependency security release

Engine: ChatGPT / Codex. Anthony explicitly instructed continuation without waiting for the separate historical-webhook incident. This supersedes the earlier release sequencing dependency on provider revocation confirmation; it does not assert revocation or authorize hiding the historical secret finding.

Code reviewed at `f299028b4d074bf3709a346b8dca25c4efd36dec`: Next.js and eslint-config-next 15.5.23 -> 15.5.26, sharp 0.35.3 -> 0.35.4 with matching platform packages/libvips, js-yaml 4.3.1 -> 4.3.2 in the lockfile. No unrelated application change. Existing Web, Backend, CodeQL, npm audit, pip-audit and dependency review checks pass for that code head. This documentation update triggers a fresh check of the resulting PR head before merge.

GHL changes: none. New environment variables: none. Webhook incident: unresolved and tracked separately; no history rewrite, secret-scan suppression or credential reuse.

NEXT: merge only the verified current PR head through GitHub, observe CI/CD, integrate current master into #148 using a normal merge, review and retest the hardening, then verify deployment/runtime. Production completion is not established by this record.

---

## 2026-08-17 — Phase 1, PR 1.4 (nothing on the site claims a feature we do not have)

**Code:** `lib/content.ts`, `components/LeadCapture.tsx`,
`components/Sections.tsx`; new `app/preview/page.tsx`, `lib/preview-data.ts`,
`scripts/verify-claims.ts` (wired into `verify:scanner`).

Working rule 4 of the plan — *no copy may claim a feature that is not verified
working in the same release* — was broken in five places. Each is now either
true or gone:

| Claim | Reality | Now |
|---|---|---|
| "No credit card, **no limits**" | 5 scans/hour, 20/day per IP, 10/day per email, 10/hour per target | States the limits. A visitor who hits one unexpectedly assumes we are broken |
| "**Nothing is persisted**" | True of scan content; the email goes to the CRM and stays there | Says what happens to the address. Rewritten again in Phase 2 against real storage |
| "**Your report is on its way.** Check your inbox" | No email is sent — `/api/lead` creates a CRM contact and nothing else | "You're on the list", and the form says delivery is not live yet |
| "Scan a URL, **a GitHub repo**, or your logs" (hero, scan section, placeholder) | The free scan fetches a URL as a web page. A GitHub URL is scanned as a page | Free scan = URLs; repo, image and log analysis attributed to the deep agents |
| "Open the agent dashboard →" | `/dashboard` is behind `middleware.ts`; every prospect was redirected to `/login` | Points at `/preview` |

**`/preview` — read-only sample dashboard.** At `/preview`, **not**
`/dashboard/preview`: middleware protects the whole `/dashboard` prefix, so a
preview underneath it would reproduce the exact bug it replaces.

It renders through the same `lib/findings.ts` helpers as the real dashboard, so
the marketing preview cannot drift from the product it advertises — and it
inherits PR 1.0's fix rather than the raw-JSON bug, which is why that PR went
first. The sample data uses **real backend shapes**, the same ones
`verify-findings.ts` tests against. It is labelled a sample in the banner, in
the page copy and in the data file.

**`verify:claims` — the rule is now enforced by CI rather than by whether
someone rereads the copy.** Each banned pattern carries the claim, why it is
false, and the PR that makes it true, so whoever ships the feature can see it
is safe to remove the rule. It also asserts `/preview` is not under a protected
prefix, and that no marketing section links to `/dashboard`.

Two things the check caught on its first run, both worth keeping: the comment
explaining *why* a false claim was removed quotes the claim, so comments must
be stripped before matching; and JSX wraps a sentence across lines, so
whitespace must be flattened or a phrase split by a newline slips through.

**Verified:** typecheck clean, build succeeds (`/preview` prerenders static),
`verify:scanner` passes including 12 new claims checks.

**Still missing:** PR 1.1 (five pricing tiers) is **blocked** — the exact
inclusions, exclusions and prices come from PRD §3, which is not in the
repository. Writing them from memory would invent customer-facing pricing
commitments, which is the thing this PR exists to stop.

**GHL:** No change. **Infrastructure:** No change.
## 2026-08-17 — Phase 1, PR 1.3 (HTTP posture check, and a transport re-baseline)

**Code:** new `lib/scanner/httpPosture.ts` and `scripts/verify-http-posture.ts`;
`lib/scanner/checks.ts`, `index.ts`, `fetcher.ts`, `scripts/verify-scanner.ts`.

**The gap this closes.** `checkSsl()` only reported a problem when the *target
itself* was requested over `http:`. Scanning `https://example.com` therefore
reported clean transport even when `http://example.com` served the entire
application unencrypted — and the bare domain is what people type, so that
plaintext request is usually the **first one of the session**, the one carrying
a saved credential.

The scanner now probes port 80 directly with `redirect: "manual"` and grades
what it finds: content served without a redirect (**high**), a redirect that
does not reach HTTPS (**high**), a temporary rather than permanent redirect
(**low**), a redirect to another host (**low**), and nothing listening at all
(**info** — the strongest posture, since there is no plaintext entry point to
intercept).

**HSTS is now read, not merely counted.** It was previously one entry in the
generic missing-header list: present or absent. The check now parses the
policy — `max-age`, `includeSubDomains`, `preload` — and reports a header sent
with `max-age=0` as *disabled* rather than present, which is the case the old
check got exactly backwards.

**Defect found and fixed while re-baselining:** HSTS was being reported
**twice** — once by the generic header list and once by the new transport
check — so a single missing header cost the score 16 points instead of 8.
`strict-transport-security` is removed from the generic list; the transport
check owns it. `verify:scanner` now asserts exactly one HSTS finding exists, so
the duplicate cannot come back.

**Score re-baseline.** Two changes cancel out on the demo fixture: the
transport check adds findings, the de-duplication removes one. The fixture
still grades **F** on leaked credentials alone. Real targets will move: a site
with good HTTPS and no HSTS loses 8 points as before, one serving plaintext on
port 80 now loses 20 it previously did not.

**`info` findings do not fail a category.** A site with a closed port 80 gets
an informational finding saying so, and still passes — otherwise telling
someone they are doing well would count against them.

**Verified:** typecheck clean, build succeeds, `verify:scanner` passes
including **40 new posture checks** — HSTS parsing (quoted values, spacing,
case, ordering, lookalike directives such as `includeSubDomainsExtra`), every
redirect shape, and an assertion that each finding carries usable detail and a
fix prompt.

**GHL:** No change. **Infrastructure:** No change.
## 2026-08-17 — Phase 0.5, PR 0.6 follow-up (the deep-scan cost is measured)

**Code:** `backend/cost_harness.py`, `backend/tests/test_cost_harness.py`,
`docs/UNIT-ECONOMICS.md`.

**The gate is answered.** Full fixture set,
[run 32019106407](https://github.com/anthonym71/securetotalscan/actions/runs/32019106407):
**32 of 32 fixtures succeeded, 0 failed**, total spend **$0.0929**.

| | |
|---|---|
| Median cost, fresh deep scan | **$0.0037** |
| p95 | **$0.0070** |
| Max | $0.0083 |
| Median wall-clock | 5.2s (p95 13.1s) |

**PRD §4 gate ($0.50), applied to p95: PASS by 71×.** The $4.99 tier can
include a deep scan — marginal LLM cost is about 0.14% of the sale price.
Phase 2 is unblocked on the question it was waiting for.

**The main open question is settled with data.** `large` — seven repositories
including the Linux kernel, Kubernetes and TensorFlow — has the *same* median
($0.0040) and maximum ($0.0042) as `deliberately-vulnerable`. Repository size
does not move cost, exactly as `build_prompt()`'s caps predicted. That was read
off the code before; it is now measured.

**And it inverts an assumption.** The expensive case is **Docker images**, not
big repositories: ~70% more per scan and three times the wall-clock, because
Trivy work scales with package count. Any abuse guard should target image
scanning, not repository size.

**Two other things closed:** repeat scans genuinely cost $0.0000, so that
marketing claim now has a measurement behind it; and
`anthonym71/securetotalscan` scanned successfully, so `GIT_TOKEN`'s scope does
include private repository read — an open risk in the plan, now closed.

**Defect found by the run itself, and fixed.** The `small` group reported
$0.0000. Those five fixtures had been scanned by a smaller run twenty minutes
earlier; `llm_cache.py` is process-global and the backend had not restarted, so
they were served from cache while still being counted as fresh, pulling the
median down. The harness classified cache hits by the fixture's *label*; it now
classifies them from the `/evals` cache counters, so an accidentally warm run is
excluded from the fresh median and named in the report. A group label records
what a fixture was for; only the counters record what happened.

**Still missing from this run**, recorded rather than glossed: peak Railway
RAM/CPU (read from the dashboard for `10:13:33Z → 10:17:01Z`), the surface-scan
grades (in the run artifact; they belong in `docs/BASELINE-2026-08.md` §8), and
any concurrency effect — every fixture ran sequentially against an idle backend.

**Verified:** backend suite passes with 3 new cache-classification tests.

**GHL:** four contacts created by the surface scans, all under
`cost-harness@securetotalscan.com`. **Infrastructure:** no change.

---

## 2026-08-17 — Phase 2, PR 2.1 (Neon Postgres foundation)

**Code:** `migrations/0001_init.sql`, `lib/db/client.ts`, `scripts/migrate.ts`,
`scripts/verify-schema.ts` (wired into `verify:scanner`); env plumbing in
`cd.yml`, `scripts/sync-vercel-env.sh`, `.env.example`.

**Schema only. No behaviour change** — nothing queries the database yet, and a
check asserts that no API route imports it. PR 2.2 is the first writer.

**The first runtime dependency this project has ever had.** `package.json`
listed exactly `next`, `react` and `react-dom` until now, so
`@neondatabase/serverless` is a supply-chain decision as much as a technical
one. It is Neon's own driver over their HTTP endpoint, so a serverless function
does not open a TCP connection per invocation and exhaust the pool under
exactly the traffic you want. `npm audit`: 0 vulnerabilities.

**Seven tables** — `customer`, `subscription`, `site`, `scan`, `report`,
`purchase`, `event_log` — with four conventions applied without exception, each
because the alternative is a silent failure:

- **Every customer-owned table carries `customer_id` and is indexed on it.**
  PR 3.4 has to *prove* customer A cannot read customer B's data, and that
  proof is impossible if a table cannot be scoped to its owner.
- **Money is integer minor units.** `amount_cents integer`, never a float.
  Scan cost is `cost_usd_micros bigint`, because a deep scan costs ~$0.004
  (PR 0.6) and cents would round every scan to zero.
- **All timestamps are `timestamptz`.**
- **`external_id` is uniquely indexed** on `purchase` and `subscription`, so a
  replayed payment webhook is a no-op rather than a second charge record.

**`customer.email` is unique on `lower(email)`**, matching how the rest of the
codebase compares addresses (`email.trim().toLowerCase()`). A case-sensitive
index would let `Alice@` and `alice@` become two customers with two histories.

**`scan.expires_at` defaults to six months** (PRD §5.7) and is indexed. Phase 2
stores and displays it honestly; Phase 4 enforces it. Storing it rather than
deriving it means the date a customer was shown is the date we act on.

**Migration runner, deliberately not a framework.** Seven tables and one
contributor does not need one. It enforces three rules: applied migrations are
**immutable** (checksummed — editing one that has already run leaves every
environment that ran it silently different, so it is an error here rather than a
surprise later); one at a time under an advisory lock, so two concurrent deploys
cannot both run `0002`; and each migration is a transaction.

**Migrations run before the Vercel deploy, never after.** Code expecting a
column that does not exist is an outage; a database with a column the code does
not use is nothing at all.

**Environment variables Anthony must set:** `DATABASE_URL` and
`DATABASE_URL_UNPOOLED`, as secrets in the **`prod` GitHub environment** —
already done. Neon issues both: pooled for runtime, direct for migrations,
because the pooler does not carry DDL or advisory locks reliably. Both are now
in `sync-vercel-env.sh` and the `cd.yml` comment block per the standing rule.

**Verified:** typecheck clean, build succeeds, `verify:scanner` passes with 33
new schema checks, `npm run migrate -- --dry` refuses cleanly with no
connection string rather than pretending to succeed.

**Two checks caught their own documentation on the first run** — the comment
explaining why money is not a float contains the word "float". SQL comments are
now stripped before matching, the same lesson `verify-claims.ts` learned an hour
earlier.

**GHL:** No change. **Infrastructure:** No DNS change; no migration has been
applied yet — the first CD run after merge applies `0001`.

---

## 2026-08-17 — CD hotfix (the Vercel env sync aborted on the first bad variable)

**Code:** `scripts/sync-vercel-env.sh`.

**CD failed on `master` from 10:37 to 11:00.** Three merged PRs — #120, #122,
#123 — sat undeployed behind a red pipeline. Found by checking the CD run
rather than by anything reporting it.

**Root cause, introduced by PR 0.7.** `add_env` runs
`vercel env add … --force`. That overrides a variable scoped to production, but
**not** one created against a different target or branch; Vercel rejects those
with *"already exists for the target production on branch undefined"*.
`ALERT_WEBHOOK_SECRET` was already on Vercel in that shape — the same way stray
`STS_SERVICE_TOKEN` entries appeared there earlier today, from an automatic
copy.

**The failure mode was worse than the failure.** The script ran under
`set -e`, so it died at that line. Every variable after it — including
`ALERT_WEBHOOK_SECRET` itself, and on the next run `DATABASE_URL` — was never
attempted, and the deploy step never ran. One variable that would not sync took
the whole pipeline down and hid the state of the rest.

**Fixed three ways:**

- **Remove and re-add when `--force` is refused**, rather than leaving
  production on a value the pipeline no longer controls.
- **No `set -e`.** Failures are collected and the job fails at the end with the
  full list, so the log shows the state of *every* variable rather than the
  state of the first broken one.
- The error line says what it means for production: *"Production is running on
  whatever value it had before this deploy."*

**Finding for Anthony: `ALERT_WEBHOOK_URL` is not set in the `prod`
environment.** The sync log shows it skipped while `ALERT_WEBHOOK_SECRET` was
present. `postAlert()` requires **both**, so **alerting is currently inert** —
it fails the `alertingConfigured()` check and returns `not-configured` without
sending. The health check will also skip its POST with a `::warning::`. Add
`ALERT_WEBHOOK_URL` as a secret in the `prod` GitHub environment and the whole
path comes alive; nothing else needs changing.

**Consequence to note:** because the Vercel job dies at the sync step, the
`0001_init` migration added in #123 has **not run yet**. It runs on the first
successful CD after this fix.

---

## 2026-08-17 — Correction: the cost measurement measured nothing

**Reported by Anthony**, who ran a GitHub analysis in the dashboard and got
`GitHub API error 401`. **`GIT_TOKEN` on the Railway backend is expired,
revoked or malformed.**

**This invalidates the cost measurement published earlier today.**
`scan_github_repo_safe()` catches an HTTP failure and returns `{"error": …}`;
`run_vuln_scanner()` turns that into `code_findings: []` plus a `scan_error`
string and **returns normally**. No agent raises, the pipeline completes,
`/evals` records a run — and the harness, which only treated an agent
*exception* as failure, marked all 26 repository fixtures successful.

**The tell was in the published table and I read it the wrong way round.**
`large` (Linux kernel, Kubernetes, TensorFlow) had the identical median and
maximum as `deliberately-vulnerable` (juice-shop, DVWA, NodeGoat) — $0.0040 and
$0.0042. I presented that as proof that `build_prompt()`'s caps bind and
repository size does not move cost. But juice-shop is built to fill all ten
prompt slots and `is-number` is five lines; **they cannot legitimately cost the
same.** Both scanned nothing. 434–516 tokens was far too few for a prompt
carrying ten findings, and `docker-image` — the one group that never touches
the GitHub API — was the only one that stood apart, because Trivy was doing
real work.

**Withdrawn:** every repository cost figure, and the $0.50 gate conclusion
drawn from them. **Still valid:** the Docker figures, the log figures, and the
cache-hit result.

**Three fixes:**

- The harness now records a run as **failed** when the report carries a
  `scan_error`, or when a `github`/`docker` fixture scanned **zero files**. A
  scan that read nothing is not a cheap scan; it is not a scan.
- `scan_github_repo_safe()` gives **401 its own message**. It previously fell
  through to `"GitHub API error: 401"`, while 404 and 403 both said *"set
  GIT_TOKEN"* — which sends someone to check whether the token is set. A 401
  means it **is** set and GitHub rejected it. Fine-grained PATs expire by
  default, so this is the failure a working deployment drifts into.
- `docs/UNIT-ECONOMICS.md` is marked **WITHDRAWN** with the reasoning above,
  rather than quietly corrected.

**Anthony must replace `GIT_TOKEN`** — a GitHub PAT with repo read access — as
a secret in the `prod` GitHub environment. Until then every GitHub deep scan
returns an error to the customer, which is a paid feature failing in
production.

**Note on why the harness did not catch this:** it checked that the *pipeline*
succeeded, not that the *scan* did. That is the same class of mistake as
`railway up --detach` reporting a successful upload as a successful deploy —
verifying the wrapper rather than the work.

---

## 2026-08-17 — CD hotfix 2 (`??` does not fall through an empty string)

**Code:** `scripts/migrate.ts`, `lib/db/client.ts`, `scripts/verify-schema.ts`.

The first CD run after the sync fix got further and then failed at **Apply
database migrations**:

```
DATABASE_URL: ***
DATABASE_URL_UNPOOLED:
…
DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL must be set.
```

`DATABASE_URL` **was** set. The migration refused anyway.

**Cause.** `process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL`.
GitHub Actions sets an env var to the **empty string** when the secret behind
it does not exist, and `??` only falls back on `null`/`undefined` — so the
expression resolved to `""` and never reached the populated variable sitting
right next to it. Changed to `||` in both places.

**The `cd.yml` guard did not catch it** because it tested the *concatenation*
(`"${DATABASE_URL_UNPOOLED}${DATABASE_URL}"`), which was non-empty and
therefore correct. Bash and JavaScript disagreed about what "set" means, and
the disagreement was invisible from either side alone.

**Also added:** migrating over the pooled connection now emits a `::warning::`
rather than proceeding silently. It works for a small forward migration, but
the pooler can drop an advisory lock, so two concurrent deploys are not fully
serialised — a weaker guarantee than the one documented, and worth saying out
loud.

**Regression check:** `verify:schema` now fails if any `process.env` chain uses
`??`, and separately asserts the `||` semantics, so the rule is not just a
grep. This class of bug will recur with every future secret.

**What worked:** the sync fix from #124 did exactly what it was built to do —
`--force` refused, the variable was removed and re-added, and the step passed.
Railway also deployed successfully in the same run.

**Environment variables Anthony must set** — all three are `prod` GitHub
environment secrets, no code changes:

| Secret | Consequence while missing |
|---|---|
| `GIT_TOKEN` (replace — returns 401) | Every GitHub deep scan fails for customers |
| `ALERT_WEBHOOK_URL` | Alerting is entirely inert |
| `DATABASE_URL_UNPOOLED` | Migrations run over the pooler with a weaker locking guarantee |

---

## 2026-08-17 — CD hotfix 3 (a migration file is a list of statements, not one)

**Code:** `scripts/migrate.ts`, `scripts/verify-schema.ts`.

The `||` fix got the migration connecting. It then failed on:

```
##[warning]DATABASE_URL_UNPOOLED is not set — migrating over the pooled connection…
Found 1 migration(s) on disk.
Pending: 0001_init.sql
Applying 0001_init.sql…
##[error]Migration failed: cannot insert multiple commands into a prepared statement
```

**Cause.** `sql.transaction([sql.query(migration.sql)])` sent the whole file as
one query. Neon's HTTP driver sends each query as a **prepared statement**, and
Postgres allows exactly one command per prepared statement. `0001_init.sql` has
24.

**Fix.** `splitStatements()` splits a file into individual statements, and the
transaction now carries one query per statement — so the all-or-nothing
guarantee is unchanged.

**Splitting SQL on `;` is a classic way to corrupt a migration**, so the
splitter respects the three places a semicolon is not a terminator: inside a
single-quoted literal (including the doubled-quote escape `'it''s'`), inside a
`--` line comment, and inside a dollar-quoted block (`$$ … $$`, `$tag$ … $tag$`)
— which is how functions and `DO` blocks are written. Block comments are left
intact, since stripping them would change the checksummed text.

Twelve checks cover it, including four run against the real `0001_init.sql`
rather than only synthetic input: 24 statements, none still containing a bare
semicolon, none comment-only, every one beginning with a DDL keyword.

**Correction to the standing blocker list.** `DATABASE_URL_UNPOOLED` was
described as "unblocks CD entirely". It does not, and the run above is the
evidence: with `||` in place, CD connects using `DATABASE_URL` and gets all the
way to applying the migration. The blocker was this code bug. Adding
`DATABASE_URL_UNPOOLED` is still worth doing — the pooler does not hold
advisory locks reliably, so concurrent deploys are not fully serialised — but
it is a correctness improvement, not a release blocker.

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

## 2026-08-17 — Phase 1, PR 1.2 (scan input accepts what people actually type)

**Code:** new `lib/scanner/target.ts` and `scripts/verify-target.ts` (wired into
`verify:scanner`); `components/ScanForm.tsx`, `ScanResults.tsx`,
`LeadCapture.tsx`, `lib/scanner/index.ts`.

**Bare domains work again.** `ScanForm` used `type="url"`, so the browser
rejected `example.com` — the most natural thing anyone types — while the
server's `normalizeTarget()` accepted it happily. The client was stricter than
the server for no reason, and the visitor got a native browser tooltip rather
than anything we wrote. The field is now `type="text"` with `inputMode="url"`,
and validation mirrors the server.

**Protocol selector, defaulting to HTTPS.** Applies only when the typed value
has no scheme; a pasted `http://…` wins and the selector syncs to it, so the
control can never disagree with the field.

**The rules moved to a shared module** so the browser can apply them without
importing the scanner. `lib/scanner/target.ts` touches no network, filesystem
or environment. **The server stays authoritative** — the SSRF block only
protects anything server-side, since the browser belongs to the attacker. The
client copy exists to catch a typo before it costs a round trip and a scan
credit, and the module says so.

**The scan email carries into the report form,** pre-filled and editable.
Asking for the same address twice on one page reads as a form not paying
attention.

**One copy fix taken early:** the consent line under the form said "We email
your report and occasional security tips." We do not email reports yet — that
is PR 2.5. Narrowed to what the address is actually used for. The rest of the
false-claims sweep is PR 1.4.

**Verified:** typecheck clean, build succeeds, `verify:scanner` passes
including **45 new target checks** — bare domains, explicit schemes, non-web
schemes (`file:`, `javascript:`, `data:`), every SSRF range including cloud
metadata `169.254.169.254`, and the near-misses that must still be allowed
(`172.32.0.1`, `local.example.com`).

**GHL:** No change. **Infrastructure:** No change.

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
## 2026-08-17 — Phase 0.5 (deep-scan cost measurement harness)

**Code:** `backend/cost_harness.py`, `backend/cost_fixtures.json`,
`backend/tests/test_cost_harness.py`, `.github/workflows/cost-measurement.yml`,
`docs/UNIT-ECONOMICS.md` (draft).

Runs the approved fixture set against the deployed backend and records tokens,
USD, wall-clock, per-agent latency and cache behaviour from `/evals`. **Manual
trigger only** — every deep run makes live OpenRouter calls, so a schedule
would be an invoice rather than a regression. It runs in GitHub Actions
because the measurement must be repeatable and re-runnable when Railway moves
off Hobby, and because the Phase 0 build environment could reach neither
production host.

**Fixture count corrected: 28 deep runs, not 26.** `docs/PR-PLAN.md` says "26
deep scans" in one place and enumerates a list summing to 28 in another. The
enumeration is what is implemented, since it is the one that names each
fixture. Plus 4 surface scans.

**Three decisions worth recording, each enforced by a test:**

- **The gate is applied to p95, not the median.** A cheap median with an
  expensive tail means one scan in twenty loses money on a $4.99 sale, and the
  median is the statistic that hides exactly that.
- **Cache-hit runs are excluded from the median.** A repeat scan is near-free;
  including it would price something other than a customer's first scan. It is
  measured separately, because "repeat scans cost near nothing" is a marketing
  claim that should be evidenced.
- **An agent error counts as a failure** even though the run still produced an
  eval record and still spent money — it did not deliver what a customer would
  have paid for. Failed runs are excluded from the median but included in the
  total spend.

**Two things the harness deliberately cannot do**, recorded rather than faked:
peak Railway RAM/CPU (not in `/evals`; read from the dashboard for the printed
window) and exactly reproducible dependency versions (no lockfile under
`backend/`, so the transitive LangGraph tree can move between runs).

**Environment variables Anthony must set:** none new. `STS_SERVICE_TOKEN` is
already a secret in the `prod` environment.

**Verified:** backend suite **110 passed** (7 new for the harness on top of the
alerting PR's 15); dry run produces the full 32-run report offline; the
workflow YAML parses. **No paid run has been made yet** — `docs/UNIT-ECONOMICS.md`
§5 is empty on purpose, and the first run should use `groups: small` to prove
the path for a few cents before committing to the full set.

**GHL:** No change — but note that surface scans create contacts, so the
workflow defaults to skipping them and uses an obviously-harness address when
they are enabled.
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
