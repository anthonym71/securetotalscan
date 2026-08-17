# Execution plan — who does what, and where it stands

Every outstanding task in the project, split by which session can actually
perform it. Generated with `docs/execution-plan.csv` from one source list, so the
table and the spreadsheet cannot disagree.

**Open the spreadsheet:** [`docs/execution-plan.csv`](./execution-plan.csv) — GitHub renders it as a sortable table, and it downloads straight into Excel or Google Sheets.

## The two lanes

| | **Desktop** | **Browser (Claude Code)** |
|---|---|---|
| Runs on | Anthony's machine | A sandboxed cloud container |
| Can reach | GHL, Stripe, DNS, Vercel, Railway, GitHub settings, a real browser with real logins | GitHub, and nothing else |
| Owns | Every account and console outside the repository | Everything under `git` — app code, backend, migrations, CI/CD, docs |
| Never does | Commits to the repository | Touches GHL, DNS, Vercel or Railway |


Verified, not assumed: from the Browser container `services.leadconnectorhq.com`, `app.gohighlevel.com` and `api.vercel.com` all return no connection; `api.github.com` returns 200. It holds no GHL, Vercel or database credentials.


**Legend** — ✅ **Owns**: does the work and is accountable for it. 🤝 Support: supplies an input, reviews, or consumes the output; does not do the work. — : not involved.


> ⚠️ **Before starting anything**, check the status in the Comments column. Browser work lands on `claude/sts-phase-0-continuation-154ndo`, **not** on the `phase2/*` branch names in `docs/PR-PLAN.md`. Looking for `phase2/scan-persistence` and finding nothing is not evidence the work is missing — it has already caused one near-duplicate build. See issue #129.


## A. Blocked on Anthony (settings only, no code)

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| A1 — Replace GIT_TOKEN. Returns 401. Generate a new GitHub PAT with repo read scope; set in GitHub > Settings > Environments > prod. | ✅ **Owns** | — | 🔴 LIVE FAILURE. Every customer GitHub deep scan is failing right now. Highest priority in the project. Two minutes to fix. |
| A2 — Supply PRD section 3: five tier names, prices, inclusions, exclusions, credits per month, seats. | 🤝 Support | 🤝 Support | ⛔ Blocks PR 1.1 (Browser) AND GHL products items B4/B5 (Desktop). One answer unblocks both lanes. Neither session may invent pricing. |
| A3 — Set ALERT_WEBHOOK_URL in GitHub prod environment. | ✅ **Owns** | — | Alerting is fully built and tested across three senders. It currently has nowhere to POST, so it is inert. |
| A4 — Set DATABASE_URL_UNPOOLED in GitHub prod environment. | ✅ **Owns** | — | Migrations currently run over the pooled connection with a warning. Pooler does not hold advisory locks, so concurrent deploys are not serialised. |
| A5 — Railway: disable GitHub auto-deploy on the API service. | ✅ **Owns** | — | Two systems deploy the backend. When they disagree, 'what is running in production?' has no answer. |

## B. GHL (docs/GHL-WORK-ORDER.md)

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| B1 — Audit existing GHL: pipelines, stages, workflows, products, payment links, custom fields, payment processor + mode. | ✅ **Owns** | — | Do first. docs/GHL_BUILD.md is a build guide, not a record of what was built — assume drift. |
| B2 — Create seven Contact custom fields (sts_last_scan_url, _grade, _score, _at, sts_scan_id, sts_tier, sts_entitlement_expires). | ✅ **Owns** | 🤝 Support | Report field IDs back. /api/lead cannot write a custom field by name — Browser needs the IDs to extend it. |
| B3 — Confirm or create pipeline: Lead > Scanned > Report sent > Trial > Paid > Churned. | ✅ **Owns** | 🤝 Support | Report pipeline ID and every stage ID. Do not rename existing stages — report the difference and Browser matches the code to GHL. |
| B4 — Create five tier products in TEST mode + one payment link per paid tier. | ✅ **Owns** | — | ⛔ Blocked on A2. Branding must read 'Secure Total Scan'. Descriptions may contain only claims true today. |
| B5 — Create the $1.99 Extended Archive product — DO NOT publish, link or make purchasable. | ✅ **Owns** | — | ⛔ Blocked on A2. Created now only so the product ID exists for the webhook map. Becomes sellable in PR 4.2, when the deletion job and expiry warnings that make the promise real actually exist. |
| B6 — Configure purchase webhook to POST https://securetotalscan.com/api/webhooks/ghl; capture signing secret into GitHub prod as GHL_WEBHOOK_SECRET. | ✅ **Owns** | 🤝 Support | Endpoint does not exist until PR 2.6 — delivery failures until then are expected, not a fault. Payload must carry order ID, product ID, customer email, amount, currency, timestamp. |
| B7 — Rename the 'New Link' payment link; standardise customer-visible branding to 'Secure Total Scan'. | ✅ **Owns** | — | A first-time buyer of a web-security product, asked for card details on link.ifactoryusa.com by a link called 'New Link', is being given every reason not to complete. |
| B8 — Report back: every object ID created, every drift from GHL_BUILD.md, webhook payload as configured, test-mode confirmation. | ✅ **Owns** | 🤝 Support | Browser writes these into docs/CHANGELOG-BUILD.md as PRD 0.1.8 requires. Field/product/stage IDs are needed soonest — PR 2.6 is written against them. |

## C. DNS (one window, batched)

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| C1 — Add send.securetotalscan.com (Resend), outreach.securetotalscan.com (reserved), pay.securetotalscan.com (GHL checkout) — together, in one change window. | ✅ **Owns** | 🤝 Support | ⛔ Do not start until A and B are done and records are written down and confirmed. NEVER touch MX, SPF/TXT, or the imap/mail/pop3/smtp CNAMEs. Verify mail flows after — send and receive a real message. |

## D. Phase 1 — Truthful pricing and UX

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| 1.0 — Dashboard raw-JSON finding render fix. | — | ✅ **Owns** | ✅ DONE — merged to master. |
| 1.1 — Five pricing tiers; hero CTA scrolls to #pricing; PLANS rewritten with exact inclusions and exclusions. | — | ✅ **Owns** | ⛔ BLOCKED on A2. Writing prices from memory would invent customer-facing commercial commitments. |
| 1.2 — Scan input: protocol selector defaulting to HTTPS, accept bare domains, mirror normalizeTarget() client-side. | — | ✅ **Owns** | ✅ DONE — merged. Server stays authoritative; the browser copy is convenience only. |
| 1.3 — HTTP posture probe + score re-baseline. | — | ✅ **Owns** | ✅ DONE — merged. Also fixed HSTS being double-counted, which cost 16 points for one missing header. |
| 1.4 — Remove five false claims; add /preview sample dashboard. | — | ✅ **Owns** | ✅ DONE — merged and LIVE at securetotalscan.com/preview. |

## E. Phase 2 — Persistence, paywall, reports

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| 2.1 — Neon Postgres schema (7 tables) + forward-only migration runner. | — | ✅ **Owns** | ✅ DONE — merged, and 0001_init.sql confirmed APPLIED in production (CD run 32023370538). |
| 2.2 — Record every scan (target, grade, score, findings, cost, 6-month expiry). Starts the peer-comparison cohort. | — | ✅ **Owns** | ✅ DONE — pushed, unmerged. Branch claude/sts-phase-0-continuation-154ndo @ f22693c. Also fixed the CD migration job that was silently never running. |
| 2.3 — Server-side paywall: public/internal type split, one sampled prompt free, entitlement-checked premium route. | — | ✅ **Owns** | ✅ DONE — pushed, unmerged, same branch @ 7e7115c. DO NOT REBUILD. Highest-risk PR in the plan; before it, every premium prompt was in every free visitor's browser. |
| 2.4 — Branded report PDF + authenticated download route. | — | ✅ **Owns** | 🔜 NEXT — Browser starts this now. No GHL dependency. Must fit Vercel function limits. |
| 2.5 — Resend email delivery on send.securetotalscan.com; deliverability evidence for Gmail, Outlook, one corporate domain. | 🤝 Support | ✅ **Owns** | ⛔ Blocked on C1. Browser writes the code and documents the exact DNS records; Desktop adds them. |
| 2.6 — GHL entitlement webhook RECEIVER, bound to (scan, customer). Never a success-URL redirect. | 🤝 Support | ✅ **Owns** | Browser can build the route, signature verification and grant against the B6 spec before Desktop configures the sender. Cannot confirm the real payload matches until B8 reports back. |
| 2.7 — Branded checkout pay.securetotalscan.com; apex and www stay on Vercel. | ✅ **Owns** | 🤝 Support | ⛔ Blocked on C1 and 2.6. Moved here from Phase 6 so first-tier buyers are not paying through an unfamiliar domain for all of Phases 2-5. |

## F. Phase 3 — Accounts, allowances, Pro

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| 3.1 — Real per-customer accounts (email magic link) replacing shared STS_ACCESS_CODES. | — | ✅ **Owns** | Depends on 2.5 (the mailer). Closes the 2.3 limitation: today a 'member' proves someone paid, not WHICH customer. |
| 3.2 — Scan-credit ledger (10/100), monthly reset on subscription anniversary, no rollover, hard stop at zero with upgrade CTA. | — | ✅ **Owns** | Never a silent failure at zero credits. |
| 3.3 — Saved sites (add, label, group, remove), per-site history, grade trend, reports list, real dashboard. | — | ✅ **Owns** | /preview stays as the marketing demo. |
| 3.4 — Subscription lifecycle (activate, cancel, failed payment, refund/chargeback) + explicit tenant-isolation test suite. | 🤝 Support | ✅ **Owns** | Named review item: customer A must not read B's sites, scans or reports. Desktop supplies GHL lifecycle events. |

## G. Phase 4 — Monitoring, retention, economics

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| 4.1 — Durable monthly scheduler surviving a backend restart (Railway cron or persisted queue, not in-process timers). | — | ✅ **Owns** | FastAPI sessions are in-memory and lost on restart, so an in-process timer silently stops monitoring. |
| 4.2 — Completion emails; grade-drop and new-critical alerts; retention enforcement (30-day and 7-day expiry warnings, logged deletion); Extended Archive becomes purchasable. | 🤝 Support | ✅ **Owns** | This is when B5's product may be published — not before. Desktop publishes it once the deletion job exists. |
| 4.3 — docs/UNIT-ECONOMICS.md finalised from 20+ measured deep scans: median, p95, gross margin after blended Stripe fees. Abuse guards. | — | ✅ **Owns** | ⚠️ The earlier measurement was INVALID — GIT_TOKEN 401 meant 26 repo fixtures scanned nothing while reporting success. Must be re-run after A1. |

## H. Phase 5 — Visual system and gamification

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| 5.1 — Motion and design tokens, prefers-reduced-motion, contrast and keyboard baseline, performance budget. | — | ✅ **Owns** | No animation may delay first meaningful paint. |
| 5.2 — Animated data-driven category map (not a spider/radar) + improvement projection. | — | ✅ **Owns** | isitsecure.ai concepts only. Its radar chart, grade rail and stacked benchmark bar are explicitly off-limits as designs. |
| 5.3 — Scan theatre driven by real scanner events; optional sound off by default, never autoplayed. | — | ✅ **Owns** | Attack vignettes tied to actual findings only — never invented ones. |
| 5.4 — Peer comparison from scans recorded since Phase 2. Hidden below a 100-scan cohort. | — | ✅ **Owns** | PR 2.2 is what starts the cohort accruing, which is why it went early. No seeded, estimated or hardcoded benchmark. |

## I. Phase 6 — QA and go-live

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| 6.1 — Branding verification: pay. resolves to GHL, apex and www serve the app, mail flows, branding consistent across all five tiers. | ✅ **Owns** | 🤝 Support | Verification only — no DNS change. Desktop checks the consoles, Browser fixes any code drift. |
| 6.2 — Full journey QA across five tiers, mobile and desktop; failure, cancellation and revocation tests; deliverability re-test. | ✅ **Owns** | 🤝 Support | Desktop drives real browsers with real logins. Browser cannot — no network access to the site from its container. |
| 6.3 — Acceptance evidence pack against PRD section 7; self-scan back to grade A as a release blocker; documented rollback. | 🤝 Support | ✅ **Owns** | The self-scan grade is a hard gate, not a target. |
| GO-LIVE — One small real charge and refund in live mode, then test > live switch. | ✅ **Owns** | — | 🔴 ONLY on Anthony's explicit approval, outside any PR. Payments stay in test mode until this moment. |

## J. Ongoing / operational

| Task | Desktop | Browser (Claude Code) | Comments |
|---|---|---|---|
| J1 — Merge the pushed-but-unmerged branch (2.2 + 2.3 + GHL work order) into master. | — | ✅ **Owns** | Awaiting Anthony's go-ahead to open the PR. Until merged, 2.2 and 2.3 are not in production. |
| J2 — Keep docs/CHANGELOG-BUILD.md current: date, phase, code change, GHL object + ID, what was verified. | 🤝 Support | ✅ **Owns** | Required by PRD 0.1.8. Desktop supplies GHL object IDs; Browser writes the entries. |
| J3 — Watch CD; fix red pipelines. | — | ✅ **Owns** | Viktor files issues, Browser fixes them in code. Three CD outages fixed today (#124, #127, #128) plus the silently-skipped migration job. |
| J4 — Re-run the deep-scan cost harness once A1 lands. | — | ✅ **Owns** | The prior run measured empty scans. docs/UNIT-ECONOMICS.md was withdrawn in #126 rather than left standing on bad data. |

---

## The critical path, in one line

**A1 (`GIT_TOKEN`) is breaking customer scans today.** **A2 (PRD §3) unblocks two lanes at once** — Browser's pricing page and Desktop's GHL products. Everything else can proceed in parallel without either session waiting on the other.

