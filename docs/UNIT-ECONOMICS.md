# Unit economics — deep scan

**Status: WITHDRAWN. The 2026-08-17 run measured scans that read nothing.**

`GIT_TOKEN` on the Railway backend was returning **HTTP 401**, so every one of
the 26 repository fixtures scanned zero files. `scan_github_repo_safe()`
catches the failure and returns `{"error": …}`; `run_vuln_scanner()` turns that
into `code_findings: []` with a `scan_error` string and returns normally — so
no agent errored, the pipeline completed, `/evals` recorded a run, and the
harness marked all 26 successful.

**The numbers in §5 are the cost of a deep scan that found nothing.** They are
a floor, not a price. Re-run once `GIT_TOKEN` is replaced.

This document has one job before Phase 2: turn "what does a deep scan cost?"
into a number, so the $4.99 tier's scope can be **decided** rather than
assumed.

PRD §4 sets the gate — *if a deep scan costs more than $0.50, the $4.99 tier
must not include one*. The full economic picture (cost per surface scan,
Railway cost per 100 scans, gross margin at $4.99/$19/$49 after blended Stripe
fees) lands in Phase 4, PR 4.3, from ≥20 measured runs. This file is where both
sets of numbers accumulate.

---

## 1. Why this had to move before Phase 2

The PRD put the measurement in Phase 4 and the $4.99 tier in Phase 2. As
written, Phase 2 would ship a tier whose scope was not yet decided — the gate
would be evaluated after the thing it gates had already been sold. Phase 0.5
exists to close that gap; the reasoning is in `docs/PR-PLAN.md` §3.1.

## 2. How to run it

```
Actions → Cost measurement → Run workflow
```

Manual only. There is no schedule and no push trigger: every deep run makes
live OpenRouter calls, and an accidental nightly run of 28 deep scans is an
invoice rather than a regression.

Start with `groups: small` to confirm the path end to end for a few cents,
then widen. Leave `skip_surface` on unless you specifically want the four
surface scans — they run through the public `/api/scan` route and create GHL
contacts.

Results land as a job summary and as a downloadable `cost-results.json` /
`cost-results.md` artifact (90-day retention). Paste the markdown into §5 below
with the date and the commit it ran against.

Offline, the harness's aggregation can be exercised without spending anything:

```bash
python backend/cost_harness.py --dry-run
cd backend && python -m pytest tests/test_cost_harness.py -q
```

## 3. The fixture set, and why each part is there

28 deep runs and 4 surface runs — `backend/cost_fixtures.json`, where every
fixture records its own justification.

| Group | Runs | What it is there to prove |
|---|---|---|
| `small` | 5 | The floor — fixed overhead per run |
| `mid-with-docker` | 5 | The common shape of a customer repository |
| `large` | 7 | That the 60-file cap binds, so cost does not scale with repo size |
| `deliberately-vulnerable` | 3 | **Worst case.** juice-shop, DVWA and NodeGoat fill all ten code-finding prompt slots; clean repos understate the token cost |
| `docker-image` | 3 | The Trivy path at three different CVE volumes |
| `logs` | 2 | The log-analysis path, synthetic and system |
| `our-own` | 2 | Our own repositories |
| `cache-hit` | 1 | A deliberate repeat — the cost of a *second* scan |
| `surface` | 4 | Free-scan wall-clock, including the self-scan whose grade is a release gate |

**A note on the plan's arithmetic.** `docs/PR-PLAN.md` describes the set as "26
deep scans" in one place and enumerates a list that sums to 28 in another. The
enumeration is what is implemented, because it is the one that names each
fixture. 28 it is.

### Two findings that shaped the design

**The prompt is bounded by construction.** `build_prompt()` takes at most 10
code findings, 10 Docker findings and 3 CVEs, each truncated, and the repo
scanner caps at 60 files / 100 KB per file. Token cost should therefore be
near-constant regardless of repository size, and the $0.50 gate is likely met
with room to spare. If that holds, **the real variables are wall-clock, Railway
RAM/CPU and external API calls**, not tokens — which changes what the Phase 4
capacity work has to look at. The `large` group exists to test that claim
rather than assume it.

**A repeated target measures a cache hit, not a scan.** `llm_cache.py` keys on
the model and messages, so re-running the same repository costs near zero.
Every fixture is therefore distinct, and the cache-hit cost is measured
separately in its own group — "repeat scans cost near nothing" is a marketing
claim and should be evidenced rather than asserted. The harness excludes
cache-hit runs from the median for the same reason: the number being priced is
a customer's *first* scan.

## 4. How the numbers are computed

- **The gate is applied to p95, not the median.** A cheap median with an
  expensive tail means one scan in twenty loses money on a $4.99 sale, and the
  median is exactly the statistic that hides it.
- **Failed runs are excluded from the median but counted in the total.** A run
  that failed still spent money; the bill does not care that we were
  disappointed.
- **An agent error counts as a failure**, even though the run produced an eval
  record, because it did not deliver what a customer would have paid for.
- **Runs are sequential.** Concurrent runs would share the backend's CPU and
  memory, so the wall-clock and RAM figures would describe a load pattern no
  customer produces.

### What the harness cannot measure

**Peak Railway RAM and CPU.** `/evals` does not carry them and there is no
metrics endpoint on the backend. Read them from the Railway dashboard for the
window the report prints, and record them in §5 by hand. Inventing a number for
a capacity decision would be worse than leaving the gap visible.

**Exactly reproducible dependency versions.** There is no lockfile under
`backend/`, so `requirements.txt` pins floors and each build installs the newest
version satisfying them. `openai` and `langgraph` are held on their current
major (PR #108), but the transitive tree — `langgraph-checkpoint`,
`langgraph-sdk`, `langchain-core` — is unpinned, so two runs a week apart can
execute different code. **Record the versions with each run.** If a later
comparison needs to be exact, that wants a lockfile, which is a separate change.

**`anthonym71/securetotalscan` is private.** If `GIT_TOKEN`'s scope excludes
private repository read, that fixture returns 404 or a rate limit rather than
results. That is a finding, not a broken harness, and the report lists it under
Failures.

## 5. Measured runs

### 2026-08-17 — full fixture set — commit `79b138d`

[Workflow run 32019106407](https://github.com/anthonym71/securetotalscan/actions/runs/32019106407).
**32 of 32 fixtures succeeded, 0 failed.** Total spend for the entire set:
**$0.0929** — nine cents.

| | |
|---|---|
| Median cost, fresh deep scan | **$0.0037** |
| p95 | **$0.0070** |
| Most expensive single scan | $0.0083 |
| Median wall-clock | 5.2s (p95 13.1s) |
| Median tokens | 492 (p95 1,565) |
| Cost of a repeat (cache hit) | $0.0000 |

**PRD §4 gate ($0.50 per deep scan), applied to p95: PASS — by 71×.**

| Group | Runs | Median | Max | Median duration |
|---|---|---|---|---|
| deliberately-vulnerable | 3 | $0.0040 | $0.0042 | 5.2s |
| docker-image | 3 | $0.0068 | $0.0083 | 15.5s |
| large | 7 | $0.0040 | $0.0042 | 5.2s |
| logs | 2 | $0.0036 | $0.0072 | 7.8s |
| mid-with-docker | 5 | $0.0035 | $0.0042 | 5.2s |
| our-own | 2 | $0.0036 | $0.0038 | 5.2s |
| small | 5 | $0.0000 | $0.0000 | 5.2s |
| surface | 4 | $0.0000 | $0.0000 | 1.6s |

**Read the `small` row as a caveat, not a result.** Those five fixtures had
been scanned by an earlier run twenty minutes before, `llm_cache.py` is
process-global, and the backend had not restarted — so they were served from
cache and cost nothing. They were counted as fresh, which pulled the reported
median down slightly. Excluding them, the fresh median is closer to **$0.0040**
and the p95 is unchanged. The harness now classifies cache hits from the
`/evals` counters rather than the fixture's label, so a later run reports this
correctly without anyone having to notice it.

### ⚠️ Why these numbers are withdrawn

**The tell was in the data and I read it the wrong way round.**

`large` (Linux kernel, Kubernetes, TensorFlow) has the *identical* median and
maximum as `deliberately-vulnerable` (juice-shop, DVWA, NodeGoat): $0.0040 and
$0.0042. I took that as confirmation that `build_prompt()`'s caps bind and
repository size does not move cost.

But juice-shop is constructed to fill all ten code-finding prompt slots, and
`jonschlinkert/is-number` is five lines. **Those two cannot legitimately cost
the same.** The real explanation is that both scanned nothing, so both produced
an empty prompt.

Everything else fits: 434–516 tokens is far too few for a prompt carrying ten
findings, and `docker-image` — the one group that does not touch the GitHub
API — is the only one that stands apart at $0.0068 and 15.5s, because Trivy was
doing real work.

**What survives:** the Docker figures, the log figures, and the cache-hit
result. What does not: every repository number, and the conclusion drawn from
them.

**Harness fix:** a run whose report carries a `scan_error`, or which scanned
zero files on a `github`/`docker` fixture, is now recorded as a **failure**.
Previously only an agent *exception* counted, and this failure mode never
raised one.

### What the numbers appeared to establish

**The prompt really is bounded by construction.** `large` — seven repositories
including the Linux kernel, Kubernetes and TensorFlow — has the *same* median
as `deliberately-vulnerable` (both $0.0040) and the same maximum ($0.0042).
Repository size does not move cost, exactly as `build_prompt()`'s caps predict.
This was the main open question and it is now answered with data rather than
by reading the code.

**Docker images are the expensive case, not big repos.** `docker-image` costs
~70% more per scan ($0.0068 median) and takes three times as long (15.5s),
because Trivy work scales with the image's package count. If anything is ever
worth an abuse guard, it is this — not repository size.

**Repeat scans genuinely cost nothing.** $0.0000 across every cache hit. That
claim can now be made in marketing copy with a measurement behind it.

**`anthonym71/securetotalscan` scanned successfully**, so `GIT_TOKEN`'s scope
does include private repository read. That was flagged as an open risk in the
plan and is now closed.

### What is still missing from this run

- **Peak Railway RAM and CPU.** Not in `/evals`; read them from the dashboard
  for the window `10:13:33Z → 10:17:01Z` and add them here.
- **Installed versions.** Not captured automatically. From the same day's CD
  build: openai 3.1.0, langgraph 1.2.11, langgraph-checkpoint 4.2.0,
  langgraph-sdk 0.4.2, langchain-core 1.5.5.
- **Surface-scan grades.** The four surface runs completed in 1.6s each but
  their grades are not in the summary table. They are in the run's
  `cost-results.json` artifact, and `docs/BASELINE-2026-08.md` §8 is where the
  self-scan grade belongs.
- **Concurrency.** Every fixture ran sequentially against an idle backend. Real
  load will move wall-clock and RAM, though not token cost.

## 6. The decision this feeds

**Answered, from §5.** Whether the $4.99 tier includes a deep scan was left
open on purpose — deciding it before the measurement would have defeated the
gate that made this phase necessary. The rule was:

- p95 ≤ $0.50 → the tier can include a deep scan.
- p95 > $0.50 → it cannot, and Phase 2 ships the $4.99 tier without one.

**Not yet answered.** Measured p95 was $0.0070, but over scans that read
nothing, so it cannot carry the decision.

**The direction is probably still favourable** — `build_prompt()` caps the
prompt at 10 code findings, 10 Docker findings and 3 CVEs, each truncated, so a
full prompt is bounded and cannot plausibly add the $0.49 needed to breach the
gate. But "probably" is exactly the word Phase 0.5 existed to remove. **Re-run
the measurement once `GIT_TOKEN` is replaced, and decide from that.**

Two caveats worth carrying into Phase 4 rather than treating as settled:

- **This is LLM cost only.** It excludes Railway compute, egress, and the
  Stripe fee — the last of which, at a blended ~60% US / ~40% EU-UK rate, will
  dwarf $0.0070 on a $4.99 sale. Margin work is PR 4.3.
- **The abuse guard should target Docker images, not repository size.** The
  measurement says size does not move cost but image scanning does, which
  inverts the assumption the plan was carrying.

Phase 4 (PR 4.3) then revisits this from ≥20 runs and adds margin per tier, the
Railway cost per 100 scans, and the abuse guards — concurrency cap, repo size
and file caps, per-hour cap inside an allowance — that the measured numbers
justify.
