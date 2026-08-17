#!/usr/bin/env python3
"""Emit docs/EXECUTION-PLAN.md and docs/execution-plan.csv from one list.

Two renderings of the same rows. Written from a single source so the table a
person reads and the spreadsheet a person sorts cannot disagree — the same
reason verify-claims.ts reads the retention interval out of the schema instead
of restating it.
"""
import csv

# (section, task, desktop, browser, comments)
# desktop / browser values: "OWNS", "SUPPORT", "—"
ROWS = [

# ── A. Blocked on Anthony ────────────────────────────────────────────────
("A. Blocked on Anthony (settings only, no code)",
 "A1 — Replace GIT_TOKEN. Returns 401. Generate a new GitHub PAT with repo read scope; set in GitHub > Settings > Environments > prod.",
 "OWNS", "—",
 "🔴 LIVE FAILURE. Every customer GitHub deep scan is failing right now. Highest priority in the project. Two minutes to fix."),

("A. Blocked on Anthony (settings only, no code)",
 "A2 — Supply PRD section 3: five tier names, prices, inclusions, exclusions, credits per month, seats.",
 "SUPPORT", "SUPPORT",
 "⛔ Blocks PR 1.1 (Browser) AND GHL products items B4/B5 (Desktop). One answer unblocks both lanes. Neither session may invent pricing."),

("A. Blocked on Anthony (settings only, no code)",
 "A3 — Set ALERT_WEBHOOK_URL in GitHub prod environment.",
 "OWNS", "—",
 "Alerting is fully built and tested across three senders. It currently has nowhere to POST, so it is inert."),

("A. Blocked on Anthony (settings only, no code)",
 "A4 — Set DATABASE_URL_UNPOOLED in GitHub prod environment.",
 "OWNS", "—",
 "Migrations currently run over the pooled connection with a warning. Pooler does not hold advisory locks, so concurrent deploys are not serialised."),

("A. Blocked on Anthony (settings only, no code)",
 "A5 — Railway: disable GitHub auto-deploy on the API service.",
 "OWNS", "—",
 "Two systems deploy the backend. When they disagree, 'what is running in production?' has no answer."),

# ── B. GHL work order ────────────────────────────────────────────────────
("B. GHL (docs/GHL-WORK-ORDER.md)",
 "B1 — Audit existing GHL: pipelines, stages, workflows, products, payment links, custom fields, payment processor + mode.",
 "OWNS", "—",
 "Do first. docs/GHL_BUILD.md is a build guide, not a record of what was built — assume drift."),

("B. GHL (docs/GHL-WORK-ORDER.md)",
 "B2 — Create seven Contact custom fields (sts_last_scan_url, _grade, _score, _at, sts_scan_id, sts_tier, sts_entitlement_expires).",
 "OWNS", "SUPPORT",
 "Report field IDs back. /api/lead cannot write a custom field by name — Browser needs the IDs to extend it."),

("B. GHL (docs/GHL-WORK-ORDER.md)",
 "B3 — Confirm or create pipeline: Lead > Scanned > Report sent > Trial > Paid > Churned.",
 "OWNS", "SUPPORT",
 "Report pipeline ID and every stage ID. Do not rename existing stages — report the difference and Browser matches the code to GHL."),

("B. GHL (docs/GHL-WORK-ORDER.md)",
 "B4 — Create five tier products in TEST mode + one payment link per paid tier.",
 "OWNS", "—",
 "⛔ Blocked on A2. Branding must read 'Secure Total Scan'. Descriptions may contain only claims true today."),

("B. GHL (docs/GHL-WORK-ORDER.md)",
 "B5 — Create the $1.99 Extended Archive product — DO NOT publish, link or make purchasable.",
 "OWNS", "—",
 "⛔ Blocked on A2. Created now only so the product ID exists for the webhook map. Becomes sellable in PR 4.2, when the deletion job and expiry warnings that make the promise real actually exist."),

("B. GHL (docs/GHL-WORK-ORDER.md)",
 "B6 — Configure purchase webhook to POST https://securetotalscan.com/api/webhooks/ghl; capture signing secret into GitHub prod as GHL_WEBHOOK_SECRET.",
 "OWNS", "SUPPORT",
 "Endpoint does not exist until PR 2.6 — delivery failures until then are expected, not a fault. Payload must carry order ID, product ID, customer email, amount, currency, timestamp."),

("B. GHL (docs/GHL-WORK-ORDER.md)",
 "B7 — Rename the 'New Link' payment link; standardise customer-visible branding to 'Secure Total Scan'.",
 "OWNS", "—",
 "A first-time buyer of a web-security product, asked for card details on link.ifactoryusa.com by a link called 'New Link', is being given every reason not to complete."),

("B. GHL (docs/GHL-WORK-ORDER.md)",
 "B8 — Report back: every object ID created, every drift from GHL_BUILD.md, webhook payload as configured, test-mode confirmation.",
 "OWNS", "SUPPORT",
 "Browser writes these into docs/CHANGELOG-BUILD.md as PRD 0.1.8 requires. Field/product/stage IDs are needed soonest — PR 2.6 is written against them."),

# ── C. DNS ───────────────────────────────────────────────────────────────
("C. DNS (one window, batched)",
 "C1 — Add send.securetotalscan.com (Resend), outreach.securetotalscan.com (reserved), pay.securetotalscan.com (GHL checkout) — together, in one change window.",
 "OWNS", "SUPPORT",
 "⛔ Do not start until A and B are done and records are written down and confirmed. NEVER touch MX, SPF/TXT, or the imap/mail/pop3/smtp CNAMEs. Verify mail flows after — send and receive a real message."),

# ── D. Phase 1 ───────────────────────────────────────────────────────────
("D. Phase 1 — Truthful pricing and UX",
 "1.0 — Dashboard raw-JSON finding render fix.",
 "—", "OWNS", "✅ DONE — merged to master."),

("D. Phase 1 — Truthful pricing and UX",
 "1.1 — Five pricing tiers; hero CTA scrolls to #pricing; PLANS rewritten with exact inclusions and exclusions.",
 "—", "OWNS",
 "⛔ BLOCKED on A2. Writing prices from memory would invent customer-facing commercial commitments."),

("D. Phase 1 — Truthful pricing and UX",
 "1.2 — Scan input: protocol selector defaulting to HTTPS, accept bare domains, mirror normalizeTarget() client-side.",
 "—", "OWNS",
 "✅ DONE — merged. Server stays authoritative; the browser copy is convenience only."),

("D. Phase 1 — Truthful pricing and UX",
 "1.3 — HTTP posture probe + score re-baseline.",
 "—", "OWNS",
 "✅ DONE — merged. Also fixed HSTS being double-counted, which cost 16 points for one missing header."),

("D. Phase 1 — Truthful pricing and UX",
 "1.4 — Remove five false claims; add /preview sample dashboard.",
 "—", "OWNS",
 "✅ DONE — merged and LIVE at securetotalscan.com/preview."),

# ── E. Phase 2 ───────────────────────────────────────────────────────────
("E. Phase 2 — Persistence, paywall, reports",
 "2.1 — Neon Postgres schema (7 tables) + forward-only migration runner.",
 "—", "OWNS",
 "✅ DONE — merged, and 0001_init.sql confirmed APPLIED in production (CD run 32023370538)."),

("E. Phase 2 — Persistence, paywall, reports",
 "2.2 — Record every scan (target, grade, score, findings, cost, 6-month expiry). Starts the peer-comparison cohort.",
 "—", "OWNS",
 "✅ DONE — pushed, unmerged. Branch claude/sts-phase-0-continuation-154ndo @ f22693c. Also fixed the CD migration job that was silently never running."),

("E. Phase 2 — Persistence, paywall, reports",
 "2.3 — Server-side paywall: public/internal type split, one sampled prompt free, entitlement-checked premium route.",
 "—", "OWNS",
 "✅ DONE — pushed, unmerged, same branch @ 7e7115c. DO NOT REBUILD. Highest-risk PR in the plan; before it, every premium prompt was in every free visitor's browser."),

("E. Phase 2 — Persistence, paywall, reports",
 "2.4 — Branded report PDF + authenticated download route.",
 "—", "OWNS",
 "🔜 NEXT — Browser starts this now. No GHL dependency. Must fit Vercel function limits."),

("E. Phase 2 — Persistence, paywall, reports",
 "2.5 — Resend email delivery on send.securetotalscan.com; deliverability evidence for Gmail, Outlook, one corporate domain.",
 "SUPPORT", "OWNS",
 "⛔ Blocked on C1. Browser writes the code and documents the exact DNS records; Desktop adds them."),

("E. Phase 2 — Persistence, paywall, reports",
 "2.6 — GHL entitlement webhook RECEIVER, bound to (scan, customer). Never a success-URL redirect.",
 "SUPPORT", "OWNS",
 "Browser can build the route, signature verification and grant against the B6 spec before Desktop configures the sender. Cannot confirm the real payload matches until B8 reports back."),

("E. Phase 2 — Persistence, paywall, reports",
 "2.7 — Branded checkout pay.securetotalscan.com; apex and www stay on Vercel.",
 "OWNS", "SUPPORT",
 "⛔ Blocked on C1 and 2.6. Moved here from Phase 6 so first-tier buyers are not paying through an unfamiliar domain for all of Phases 2-5."),

# ── F. Phase 3 ───────────────────────────────────────────────────────────
("F. Phase 3 — Accounts, allowances, Pro",
 "3.1 — Real per-customer accounts (email magic link) replacing shared STS_ACCESS_CODES.",
 "—", "OWNS",
 "Depends on 2.5 (the mailer). Closes the 2.3 limitation: today a 'member' proves someone paid, not WHICH customer."),

("F. Phase 3 — Accounts, allowances, Pro",
 "3.2 — Scan-credit ledger (10/100), monthly reset on subscription anniversary, no rollover, hard stop at zero with upgrade CTA.",
 "—", "OWNS",
 "Never a silent failure at zero credits."),

("F. Phase 3 — Accounts, allowances, Pro",
 "3.3 — Saved sites (add, label, group, remove), per-site history, grade trend, reports list, real dashboard.",
 "—", "OWNS",
 "/preview stays as the marketing demo."),

("F. Phase 3 — Accounts, allowances, Pro",
 "3.4 — Subscription lifecycle (activate, cancel, failed payment, refund/chargeback) + explicit tenant-isolation test suite.",
 "SUPPORT", "OWNS",
 "Named review item: customer A must not read B's sites, scans or reports. Desktop supplies GHL lifecycle events."),

# ── G. Phase 4 ───────────────────────────────────────────────────────────
("G. Phase 4 — Monitoring, retention, economics",
 "4.1 — Durable monthly scheduler surviving a backend restart (Railway cron or persisted queue, not in-process timers).",
 "—", "OWNS",
 "FastAPI sessions are in-memory and lost on restart, so an in-process timer silently stops monitoring."),

("G. Phase 4 — Monitoring, retention, economics",
 "4.2 — Completion emails; grade-drop and new-critical alerts; retention enforcement (30-day and 7-day expiry warnings, logged deletion); Extended Archive becomes purchasable.",
 "SUPPORT", "OWNS",
 "This is when B5's product may be published — not before. Desktop publishes it once the deletion job exists."),

("G. Phase 4 — Monitoring, retention, economics",
 "4.3 — docs/UNIT-ECONOMICS.md finalised from 20+ measured deep scans: median, p95, gross margin after blended Stripe fees. Abuse guards.",
 "—", "OWNS",
 "⚠️ The earlier measurement was INVALID — GIT_TOKEN 401 meant 26 repo fixtures scanned nothing while reporting success. Must be re-run after A1."),

# ── H. Phase 5 ───────────────────────────────────────────────────────────
("H. Phase 5 — Visual system and gamification",
 "5.1 — Motion and design tokens, prefers-reduced-motion, contrast and keyboard baseline, performance budget.",
 "—", "OWNS",
 "No animation may delay first meaningful paint."),

("H. Phase 5 — Visual system and gamification",
 "5.2 — Animated data-driven category map (not a spider/radar) + improvement projection.",
 "—", "OWNS",
 "isitsecure.ai concepts only. Its radar chart, grade rail and stacked benchmark bar are explicitly off-limits as designs."),

("H. Phase 5 — Visual system and gamification",
 "5.3 — Scan theatre driven by real scanner events; optional sound off by default, never autoplayed.",
 "—", "OWNS",
 "Attack vignettes tied to actual findings only — never invented ones."),

("H. Phase 5 — Visual system and gamification",
 "5.4 — Peer comparison from scans recorded since Phase 2. Hidden below a 100-scan cohort.",
 "—", "OWNS",
 "PR 2.2 is what starts the cohort accruing, which is why it went early. No seeded, estimated or hardcoded benchmark."),

# ── I. Phase 6 ───────────────────────────────────────────────────────────
("I. Phase 6 — QA and go-live",
 "6.1 — Branding verification: pay. resolves to GHL, apex and www serve the app, mail flows, branding consistent across all five tiers.",
 "OWNS", "SUPPORT",
 "Verification only — no DNS change. Desktop checks the consoles, Browser fixes any code drift."),

("I. Phase 6 — QA and go-live",
 "6.2 — Full journey QA across five tiers, mobile and desktop; failure, cancellation and revocation tests; deliverability re-test.",
 "OWNS", "SUPPORT",
 "Desktop drives real browsers with real logins. Browser cannot — no network access to the site from its container."),

("I. Phase 6 — QA and go-live",
 "6.3 — Acceptance evidence pack against PRD section 7; self-scan back to grade A as a release blocker; documented rollback.",
 "SUPPORT", "OWNS",
 "The self-scan grade is a hard gate, not a target."),

("I. Phase 6 — QA and go-live",
 "GO-LIVE — One small real charge and refund in live mode, then test > live switch.",
 "OWNS", "—",
 "🔴 ONLY on Anthony's explicit approval, outside any PR. Payments stay in test mode until this moment."),

# ── J. Ongoing ───────────────────────────────────────────────────────────
("J. Ongoing / operational",
 "J1 — Merge the pushed-but-unmerged branch (2.2 + 2.3 + GHL work order) into master.",
 "—", "OWNS",
 "Awaiting Anthony's go-ahead to open the PR. Until merged, 2.2 and 2.3 are not in production."),

("J. Ongoing / operational",
 "J2 — Keep docs/CHANGELOG-BUILD.md current: date, phase, code change, GHL object + ID, what was verified.",
 "SUPPORT", "OWNS",
 "Required by PRD 0.1.8. Desktop supplies GHL object IDs; Browser writes the entries."),

("J. Ongoing / operational",
 "J3 — Watch CD; fix red pipelines.",
 "—", "OWNS",
 "Viktor files issues, Browser fixes them in code. Three CD outages fixed today (#124, #127, #128) plus the silently-skipped migration job."),

("J. Ongoing / operational",
 "J4 — Re-run the deep-scan cost harness once A1 lands.",
 "—", "OWNS",
 "The prior run measured empty scans. docs/UNIT-ECONOMICS.md was withdrawn in #126 rather than left standing on bad data."),
]

HEADERS = ["Task", "Desktop", "Browser (Claude Code)", "Comments"]

MARK = {"OWNS": "✅ **Owns**", "SUPPORT": "🤝 Support", "—": "—"}
CSV_MARK = {"OWNS": "OWNS", "SUPPORT": "support", "—": ""}


def write_csv(path):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["Section"] + HEADERS)
        for section, task, desktop, browser, comments in ROWS:
            w.writerow([section, task, CSV_MARK[desktop], CSV_MARK[browser], comments])


def write_md(path):
    out = []
    out.append("# Execution plan — who does what, and where it stands\n")
    out.append(
        "Every outstanding task in the project, split by which session can actually\n"
        "perform it. Generated with `docs/execution-plan.csv` from one source list, so the\n"
        "table and the spreadsheet cannot disagree.\n"
    )
    out.append(
        "**Open the spreadsheet:** [`docs/execution-plan.csv`](./execution-plan.csv) — "
        "GitHub renders it as a sortable table, and it downloads straight into Excel or "
        "Google Sheets.\n"
    )
    out.append("## The two lanes\n")
    out.append(
        "| | **Desktop** | **Browser (Claude Code)** |\n"
        "|---|---|---|\n"
        "| Runs on | Anthony's machine | A sandboxed cloud container |\n"
        "| Can reach | GHL, Stripe, DNS, Vercel, Railway, GitHub settings, a real browser with real logins | GitHub, and nothing else |\n"
        "| Owns | Every account and console outside the repository | Everything under `git` — app code, backend, migrations, CI/CD, docs |\n"
        "| Never does | Commits to the repository | Touches GHL, DNS, Vercel or Railway |\n"
    )
    out.append(
        "\nVerified, not assumed: from the Browser container "
        "`services.leadconnectorhq.com`, `app.gohighlevel.com` and `api.vercel.com` all "
        "return no connection; `api.github.com` returns 200. It holds no GHL, Vercel or "
        "database credentials.\n"
    )
    out.append(
        "\n**Legend** — ✅ **Owns**: does the work and is accountable for it. "
        "🤝 Support: supplies an input, reviews, or consumes the output; does not do the work. "
        "— : not involved.\n"
    )
    out.append(
        "\n> ⚠️ **Before starting anything**, check the status in the Comments column. "
        "Browser work lands on `claude/sts-phase-0-continuation-154ndo`, **not** on the "
        "`phase2/*` branch names in `docs/PR-PLAN.md`. Looking for `phase2/scan-persistence` "
        "and finding nothing is not evidence the work is missing — it has already caused one "
        "near-duplicate build. See issue #129.\n"
    )

    current = None
    for section, task, desktop, browser, comments in ROWS:
        if section != current:
            out.append(f"\n## {section}\n")
            out.append("| Task | Desktop | Browser (Claude Code) | Comments |")
            out.append("|---|---|---|---|")
            current = section
        # Escape pipes so a description containing one cannot break the table.
        cells = [c.replace("|", "\\|") for c in (task, comments)]
        out.append(f"| {cells[0]} | {MARK[desktop]} | {MARK[browser]} | {cells[1]} |")

    out.append(
        "\n---\n\n"
        "## The critical path, in one line\n\n"
        "**A1 (`GIT_TOKEN`) is breaking customer scans today.** **A2 (PRD §3) unblocks two "
        "lanes at once** — Browser's pricing page and Desktop's GHL products. Everything "
        "else can proceed in parallel without either session waiting on the other.\n"
    )
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


write_csv("docs/execution-plan.csv")
write_md("docs/EXECUTION-PLAN.md")
print(f"{len(ROWS)} rows written to docs/EXECUTION-PLAN.md and docs/execution-plan.csv")
