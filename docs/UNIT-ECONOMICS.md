# Unit economics — deep scan

**Status: draft. The harness exists; no measured run has been recorded yet.**

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

> Nothing here yet. Add one subsection per run: date, commit, fixture groups,
> the pasted markdown summary, and the Railway peak RAM/CPU read by hand for
> the reported window.

### Template

```
### YYYY-MM-DD — <groups> — commit <sha>

<paste cost-results.md>

Railway peak (from the dashboard, for the window above):
  memory: … MB
  CPU:    … vCPU

Installed versions: openai …, langgraph …, langgraph-checkpoint …
```

## 6. The decision this feeds

**Open, and deliberately not pre-empted:** whether the $4.99 tier includes a
deep scan. Deciding it before the measurement would defeat the gate that made
this phase necessary. Once §5 has a p95, the answer follows from it:

- p95 ≤ $0.50 → the tier can include a deep scan.
- p95 > $0.50 → it cannot, and Phase 2 ships the $4.99 tier without one.

Phase 4 (PR 4.3) then revisits this from ≥20 runs and adds margin per tier, the
Railway cost per 100 scans, and the abuse guards — concurrency cap, repo size
and file caps, per-hour cap inside an allowance — that the measured numbers
justify.
