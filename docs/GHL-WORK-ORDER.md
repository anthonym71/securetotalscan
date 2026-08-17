# GHL work order — for the Claude Desktop session

**Status:** open · **Raised:** 2026-08-17 · **Owner:** Anthony + Claude Desktop
**Why this document exists:** the Claude Code session building this repository
runs in a sandboxed cloud container whose network reaches GitHub and almost
nothing else. `services.leadconnectorhq.com` and `app.gohighlevel.com` both
return no connection from it, and it holds no GHL credentials. GHL work
therefore has to happen in a session running on Anthony's own machine, with his
browser and his login. This is the specification for that session.

Everything here is written so the Desktop session can be handed the file and
work from it without needing the conversation that produced it.

---

## 0. Division of labour

Three parties, one rule that keeps them from colliding: **the repository is
mine, the GHL account and the settings screens are Desktop's, and nothing is
owned by both.** Where the two must meet — a webhook payload, a custom field ID
— the interface is written down here rather than assumed.

| | **Claude Code (this repo, cloud)** | **Claude Desktop (Anthony's machine)** |
|---|---|---|
| Can reach | GitHub only | GHL, Vercel, Railway, Stripe, DNS, GitHub settings, a real browser |
| Owns | Everything under `git` — app code, backend, migrations, CI/CD, docs | Every account and console outside the repository |
| Writes | Code, workflows, schema, tests, changelog | GHL objects, DNS records, environment secrets |
| Never does | Touches GHL, DNS, Vercel or Railway consoles | Commits to the repository |

**The seam between us, stated exactly:**

| Interface | Defined by | Consumed by |
|---|---|---|
| `POST /api/webhooks/ghl` | Desktop configures the sender (item 6); I build the receiver (PR 2.6) | Both — it must match on the first try or entitlement silently fails |
| Custom field IDs | Desktop creates and reports them (item 2) | Me — `/api/lead` cannot write a field by name |
| Pipeline + stage IDs | Desktop reports them (item 3) | Me — workflow moves are driven from code |
| Product IDs | Desktop creates them (items 4–5) | Me — the webhook maps product → entitlement tier |
| `GHL_WEBHOOK_SECRET`, `GIT_TOKEN`, `ALERT_WEBHOOK_URL` | Desktop sets them in the GitHub `prod` environment | The pipeline, which syncs them onward. I never see their values |
| PRD §3 tiers | **Anthony** — neither of us can invent these | Desktop (product creation) *and* me (PR 1.1 pricing page) |

**What I am doing in parallel, so Desktop does not wait on me and I do not wait
on Desktop:**

- PR 2.2 — scan persistence *(done, pushed)*
- PR 2.3 — server-side paywall. The highest-risk PR in the plan: `/api/scan`
  currently returns every premium fix prompt to every free visitor, so there is
  nothing to sell until this lands. **No GHL dependency**
- PR 2.4 — branded report PDF. **No GHL dependency**
- PR 2.6 — the webhook *receiver*. I can build the route, the signature
  verification and the entitlement grant against the payload shape specified in
  item 6 before Desktop has configured the sender; what I cannot do is confirm
  the real payload matches until Desktop reports back
- PR 1.1 — pricing page. **Blocked on the same PRD §3 that blocks Desktop's
  items 4–5.** One answer from Anthony unblocks both of us at once

**What genuinely blocks me and only Anthony can clear:** `GIT_TOKEN` (customer
GitHub scans are failing right now), `ALERT_WEBHOOK_URL`, and PRD §3.

---

## 1. What already exists

Do not rebuild any of this. Confirm it, then extend it.

| Thing | State |
|---|---|
| GHL location | Live, in use. Location ID is already set as `GHL_LOCATION_ID` in Vercel production |
| Private integration token | Exists as `GHL_API_TOKEN` in Vercel production, scoped for contacts |
| Lead capture | Working. `/api/lead` in the app creates a GHL contact on every free scan, tagged `secure-total-scan-lead`, `grade-<a..f>`, `score-<n>`, with `website` set to the scanned URL |
| Payment link | One exists, on `link.ifactoryusa.com`, named **"New Link"**, wired to the hero "Get Pro — $49/mo" CTA |
| Pipeline / workflows | Per `docs/GHL_BUILD.md`, stages `Lead → Scanned → Report sent → Trial → Paid → Churned` were specified. **Verify what actually exists** before assuming |

The app side that GHL will talk to is **not built yet**. PR 2.6
(`phase2/ghl-entitlement-webhook`) builds the receiving endpoint. This work
order gets GHL ready so that PR can be written against something real rather
than against a guess.

---

## 2. Hard constraints

These are not preferences. Breaking any of them is worse than not doing the
work at all.

1. **Additive only.** Do not delete or rename any existing pipeline, workflow,
   contact, product, custom field or DNS record. If something looks wrong,
   report it — do not fix it.
2. **Payments stay in TEST mode.** Every product and payment link created here
   is a test-mode object. The switch to live happens once, at the end of Phase
   6, on Anthony's explicit approval, and never as a side effect of this work.
3. **DNS: never touch MX, SPF/TXT, or the `imap` / `mail` / `pop3` / `smtp`
   CNAMEs.** The zone carries live email. The only DNS additions authorised
   anywhere in this plan are three new subdomains — `send.`, `outreach.` and
   `pay.` — and they are **item 8 below, batched into one change window**, not
   done piecemeal.
4. **Record the ID of every object you create.** Object IDs go into
   `docs/CHANGELOG-BUILD.md`, which PRD §0.1.8 requires. An object with no
   recorded ID is one nobody can reference from code later.
5. **No secret in any message, screenshot or file you hand back.** Tokens and
   signing secrets go straight into the GitHub `prod` environment (item 7),
   never into chat.

---

## 3. Blocked before you start: the five tiers

**Items 4 and 5 cannot be done until Anthony supplies PRD §3.**

The plan requires five pricing tiers. The repository knows four numbers —
`$1.99`, `$4.99`, `$19`, `$49` — and the names Free, Pro and Organization, but
**not** the exact inclusions, exclusions and tier-to-price mapping. Those live
in PRD §3, which is not in the repository. The same gap is blocking PR 1.1 on
the code side.

Writing prices or inclusions from memory would invent customer-facing
commercial commitments. **Ask Anthony for PRD §3 first.** If he doesn't have it
to hand, ask him for exactly this and write it down verbatim:

- the five tier names, in order
- the price and billing period of each (`$49/month`, never `$49.99`)
- what each includes: scan credits per month, deep scans yes/no, monitoring
  frequency, report formats, seats
- what each explicitly excludes
- which tier the "no rollover" rule applies to
- whether Organization is a price or "contact sales"

Items 1, 2, 3, 6, 7, 9 and 10 are **not** blocked. Do those first.

One warning that comes from measurement, not opinion: the deep-scan cost
harness has not yet produced a valid figure, so whether the **$4.99 tier can
include a deep scan is undecided**. Do not write "includes a deep scan" into
the $4.99 product description. If Anthony's §3 says it does, flag it and leave
the description neutral until Phase 4.3 confirms the margin.

---

## 4. The work, in order

### Item 1 — Audit what is actually there
Before creating anything, list what exists and report it back: pipelines and
their stages, workflows and their triggers, products, payment links, custom
fields, and the connected payment processor with its mode (test/live). Compare
against `docs/GHL_BUILD.md`. That file is a build *guide*, not a record of what
was built — assume drift.

### Item 2 — Custom fields
The app currently pushes grade and score as **tags**, which cannot be sorted,
filtered numerically, or read back cleanly. Create custom fields on the Contact
object:

| Field | Type | Purpose |
|---|---|---|
| `sts_last_scan_url` | Text | The target of the most recent scan |
| `sts_last_scan_grade` | Text (A–F) | Most recent grade |
| `sts_last_scan_score` | Number | Most recent score, 0–100 |
| `sts_last_scan_at` | Date | When |
| `sts_scan_id` | Text | The `scan.id` UUID from our database — this is the join key between GHL and our own records |
| `sts_tier` | Text | Current entitlement tier |
| `sts_entitlement_expires` | Date | When the current entitlement lapses |

Report each field's **ID**. The app cannot write to a custom field by name —
`/api/lead` needs the ID, and extending it to do so is a code change I make
once you send them.

### Item 3 — Pipeline
Confirm or create the opportunity pipeline with stages
`Lead → Scanned → Report sent → Trial → Paid → Churned`. Report the pipeline ID
and every stage ID. Do not rename existing stages even if the names differ
slightly — report the difference instead and we will match the code to GHL.

### Item 4 — Five tier products *(blocked on §3)*
Create one product per tier, in **test mode**, with:
- the exact name Anthony supplies, branded **"Secure Total Scan"** (not
  "SecureTotalScan", not "STS")
- the price and interval from §3
- a description containing only claims that are true today

Then one payment link per paid tier. Report product IDs and payment link URLs.

### Item 5 — Extended Archive, $1.99 *(blocked on §3, and deliberately unsellable)*
Create the product. **Do not publish it, do not link it from anywhere, and do
not make it purchasable.**

It extends scan retention from six months to twelve. The deletion job and the
30-day/7-day expiry warnings that make that promise real are built in Phase 4.2.
Selling a retention extension before the retention system exists is selling
something we cannot deliver. It becomes purchasable in Phase 4.2 and not before.

Create it now only so the product ID exists for the webhook mapping in item 6.

### Item 6 — Purchase webhook
Configure a webhook that fires on a completed order / successful payment.

- **Endpoint:** `https://securetotalscan.com/api/webhooks/ghl`
  (confirm the production domain with Anthony first — if the site is still
  served from the `.vercel.app` address, use that and tell me, because the code
  must match exactly.)
- **Method:** POST, JSON.
- **It must carry**, at minimum: the order/transaction ID, the product ID, the
  customer email, the amount and currency, and the timestamp.

The endpoint does not exist yet — it is PR 2.6. Expect delivery failures until
that ships; that is correct and expected, not a fault to debug. GHL's retries
are what will populate it once the route is live.

**Why a webhook and not a success-URL redirect:** a redirect is a browser
navigation the customer controls. Anyone can visit the success URL without
paying. The webhook is server-to-server and signed. Entitlement is granted from
the webhook or it is not granted.

Capture the **signing secret**. Do not paste it into chat. Put it into
GitHub → the repository `anthonym71/securetotalscan` → Settings → Environments
→ **prod** → Secrets, named `GHL_WEBHOOK_SECRET`. Tell me only that it is set.

### Item 7 — Two secrets Anthony already owes the pipeline
While you have his GitHub settings open, these are blocking work on my side and
take a minute each. Same place: Settings → Environments → **prod** → Secrets.

| Secret | Why it is blocking |
|---|---|
| `GIT_TOKEN` | **Expired or revoked — returns 401.** Every GitHub deep scan a customer runs is currently failing. This is the highest-priority item in this entire document. Generate a new GitHub personal access token with `repo` read scope and replace it |
| `ALERT_WEBHOOK_URL` | Operational alerting is a no-op without it. The code, the signing and the three senders are all built and tested; they have nowhere to POST |

Also, in **Railway** → the API service → Settings: **disable GitHub
auto-deploy.** Two systems currently deploy the backend — the pipeline and
Railway's own trigger — and when they disagree, the question "what is running in
production?" has no answer.

### Item 8 — DNS: `send.`, `outreach.`, `pay.` — ONE window, and not yet
**Do not do this item until items 1–7 are done and the exact records are
written down and reviewed.**

Three subdomains, added together in a single change window so that mail is
verified once afterwards rather than twice:

- `send.securetotalscan.com` — Resend transactional sending (PR 2.5)
- `outreach.securetotalscan.com` — reserved for Phase 7 marketing sending, so
  that transactional reputation is never shared with outreach. Reserved now
  because retrofitting sender separation after a reputation problem is
  expensive
- `pay.securetotalscan.com` — GHL branded checkout (PR 2.7)

The exact records come from Resend and GHL respectively. Write them down, have
Anthony confirm them, add them, then **verify mail still flows** — send and
receive a real message on the existing address before calling it done.

Apex and `www` stay pointed at Vercel. Nothing else in the zone changes.

### Item 9 — Branding consistency
The payment link is currently named **"New Link"** and checkout runs on
`link.ifactoryusa.com`. A first-time buyer of a *web security* product, being
asked for card details on an unfamiliar domain by a link called "New Link", is
being given every reason not to complete. Rename the link, and set customer-
visible branding to "Secure Total Scan" across every product, link, checkout
page and receipt.

### Item 10 — Report back
Hand back a single list I can paste into `docs/CHANGELOG-BUILD.md`:

- every object created, with its ID
- every object that already existed and differs from `docs/GHL_BUILD.md`
- the webhook endpoint and payload shape as actually configured
- confirmation that payments are in test mode
- confirmation that no object was deleted or renamed except the payment link in
  item 9
- anything you were blocked on

Custom field IDs, product IDs and the pipeline stage IDs are the ones I need
soonest — PR 2.6 is written against them.

---

## 5. What not to do

- Do not switch payments to live mode.
- Do not delete or rename anything except the "New Link" payment link.
- Do not touch MX, SPF, TXT or the mail CNAMEs.
- Do not publish the Extended Archive product.
- Do not write a tier description containing a claim not verified working
  today — the same rule the app's copy is now held to by an automated check.
- Do not paste any token or signing secret into the conversation.
