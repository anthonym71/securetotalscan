"""Deep-scan cost measurement harness (docs/PR-PLAN.md, PR 0.6).

Runs a fixture set of real scans against the deployed backend and records what
each one cost: tokens, USD, wall-clock, per-agent latency and cache behaviour,
read from ``/evals/{session_id}``.

The point is a decision, not a dashboard. PRD §4 sets a gate — if a deep scan
costs more than $0.50, the $4.99 tier must not include one — and that gate
cannot be applied to an estimate.

**This runs in GitHub Actions, not from a developer machine.** Two reasons:
the measurement must be repeatable and versioned so it can be re-run when
Railway moves off Hobby (which changes the numbers), and the environment
Phase 0 was built from cannot reach either production host.

**It spends real money.** Every deep run makes live OpenRouter calls, so the
workflow is `workflow_dispatch` only — never on a schedule, never on a push.

Usage:
    python cost_harness.py --base-url https://…  --out results.json
    python cost_harness.py --dry-run                 # no network, shape check
    python cost_harness.py --only small,cache-hit    # subset by group
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import httpx

FIXTURES_PATH = Path(__file__).parent / "cost_fixtures.json"

SERVICE_AUTH_HEADER = "x-sts-service-auth"

#: A deep run that has not finished by now is stuck. Recorded as a failure
#: rather than waited on, so one bad fixture cannot consume the whole job.
RUN_TIMEOUT_SECONDS = 900
POLL_INTERVAL_SECONDS = 5

#: Gate from PRD §4. The number the whole exercise exists to test.
DEEP_SCAN_COST_GATE_USD = 0.50


@dataclass
class RunResult:
    """One fixture's measured outcome."""

    id: str
    group: str
    kind: str
    target: str
    ok: bool
    session_id: str = ""
    wall_clock_s: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    cost_if_uncached_usd: float = 0.0
    cache_hits: int = 0
    cache_misses: int = 0
    agent_errors: list[str] = field(default_factory=list)
    agent_latency_ms: dict[str, float] = field(default_factory=dict)
    used_fallback: bool = False
    #: Surface scans only — the graded result, which the self-scan needs
    #: because grade A is a release gate (PRD §7).
    grade: str = ""
    score: int = 0
    error: str = ""


# ── Aggregation ───────────────────────────────────────────────────────────
#
# Kept free of I/O so CI can test it without a network or an API key. The
# numbers these produce end up in a pricing decision, so they are worth
# testing rather than eyeballing once.


def percentile(values: list[float], p: float) -> float:
    """Linear-interpolated percentile, `p` in 0..100.

    ``statistics.quantiles`` needs at least two data points and returns a
    fixed set of cut points; a fixture run can legitimately produce one
    successful result, and p95 of one number is that number.
    """
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (p / 100) * (len(ordered) - 1)
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    weight = rank - low
    return ordered[low] * (1 - weight) + ordered[high] * weight


def summarize(results: Iterable[RunResult]) -> dict[str, Any]:
    """Aggregate run results into the figures the pricing decision needs.

    Cache hits are summarised separately rather than folded into the median.
    A repeat scan costs near zero, so including it would drag the median down
    and describe a cost we do not actually incur on a customer's first scan —
    which is the one being priced.
    """
    everything = list(results)
    ok = [r for r in everything if r.ok]
    fresh = [r for r in ok if r.group != "cache-hit"]
    cached = [r for r in ok if r.group == "cache-hit"]

    costs = [r.cost_usd for r in fresh]
    durations = [r.wall_clock_s for r in fresh]
    tokens = [float(r.input_tokens + r.output_tokens) for r in fresh]

    by_group: dict[str, dict[str, Any]] = {}
    for result in fresh:
        bucket = by_group.setdefault(
            result.group, {"runs": 0, "costs": [], "durations": []}
        )
        bucket["runs"] += 1
        bucket["costs"].append(result.cost_usd)
        bucket["durations"].append(result.wall_clock_s)
    for bucket in by_group.values():
        bucket["median_cost_usd"] = round(percentile(bucket["costs"], 50), 6)
        bucket["max_cost_usd"] = round(max(bucket["costs"]), 6) if bucket["costs"] else 0.0
        bucket["median_duration_s"] = round(percentile(bucket["durations"], 50), 1)
        del bucket["costs"]
        del bucket["durations"]

    median_cost = percentile(costs, 50)
    p95_cost = percentile(costs, 95)

    return {
        "runs_attempted": len(everything),
        "runs_succeeded": len(ok),
        "runs_failed": len(everything) - len(ok),
        "fresh_runs": len(fresh),
        "cache_hit_runs": len(cached),
        "median_cost_usd": round(median_cost, 6),
        "p95_cost_usd": round(p95_cost, 6),
        "max_cost_usd": round(max(costs), 6) if costs else 0.0,
        "total_cost_usd": round(sum(r.cost_usd for r in everything), 6),
        "median_duration_s": round(percentile(durations, 50), 1),
        "p95_duration_s": round(percentile(durations, 95), 1),
        "median_total_tokens": int(percentile(tokens, 50)),
        "p95_total_tokens": int(percentile(tokens, 95)),
        "median_cache_hit_cost_usd": round(
            percentile([r.cost_usd for r in cached], 50), 6
        ),
        "gate_usd": DEEP_SCAN_COST_GATE_USD,
        # The gate is applied to p95, not the median. Half the customers
        # costing more than the tier price is not a business, and the median
        # would hide exactly that.
        "p95_within_gate": p95_cost <= DEEP_SCAN_COST_GATE_USD if costs else False,
        "by_group": by_group,
        "failures": [
            {"id": r.id, "target": r.target, "error": r.error}
            for r in everything
            if not r.ok
        ],
    }


# ── Execution ─────────────────────────────────────────────────────────────


def load_fixtures(path: Path = FIXTURES_PATH) -> dict[str, Any]:
    return json.loads(path.read_text())


def _start_payload(fixture: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Map a fixture to the backend endpoint and request body that starts it."""
    kind = fixture["kind"]
    if kind == "github":
        return "/analyze/github", {"repo_url": fixture["target"], "include_logs": False}
    if kind == "docker":
        return "/analyze/docker", {"image_url": fixture["target"], "include_logs": False}
    if kind == "logs":
        return "/analyze", {"source": fixture["target"]}
    raise ValueError(f"unknown fixture kind: {kind!r}")


def run_fixture(
    client: httpx.Client,
    fixture: dict[str, Any],
    timeout_s: int = RUN_TIMEOUT_SECONDS,
) -> RunResult:
    """Start one deep scan, wait for it, and read back its eval record."""
    result = RunResult(
        id=fixture["id"],
        group=fixture["group"],
        kind=fixture["kind"],
        target=fixture["target"],
        ok=False,
    )

    try:
        path, body = _start_payload(fixture)
        started = time.perf_counter()
        response = client.post(path, json=body, timeout=60)
        if response.status_code >= 400:
            result.error = f"start returned {response.status_code}: {response.text[:200]}"
            return result

        session_id = response.json().get("session_id", "")
        if not session_id:
            result.error = "start returned no session_id"
            return result
        result.session_id = session_id

        # /report/{id} 404s until the run completes, which is the completion
        # signal. Polling it beats subscribing to the SSE stream here: the
        # stream reports agent progress, not the eval record we actually want.
        deadline = time.perf_counter() + timeout_s
        while True:
            report = client.get(f"/report/{session_id}", timeout=30)
            if report.status_code == 200:
                break
            if time.perf_counter() > deadline:
                result.error = f"run did not complete within {timeout_s}s"
                return result
            time.sleep(POLL_INTERVAL_SECONDS)

        result.wall_clock_s = round(time.perf_counter() - started, 2)
        result.used_fallback = bool(report.json().get("used_fallback", False))

        evals = client.get(f"/evals/{session_id}", timeout=30)
        if evals.status_code != 200:
            result.error = f"evals returned {evals.status_code}"
            return result

        detail = evals.json()
        summary = detail.get("summary", {})
        result.input_tokens = summary.get("total_input_tokens", 0)
        result.output_tokens = summary.get("total_output_tokens", 0)
        result.cost_usd = summary.get("total_cost_usd", 0.0)
        result.cost_if_uncached_usd = summary.get("cost_if_uncached_usd", 0.0)
        result.cache_hits = summary.get("llm_cache_hits", 0)
        result.cache_misses = summary.get("llm_cache_misses", 0)
        for agent in detail.get("agents", []):
            result.agent_latency_ms[agent["agent"]] = agent.get("latency_ms", 0)
            if agent.get("error"):
                result.agent_errors.append(agent["agent"])

        # An agent that errored still produces an eval record, and its cost is
        # real, but the run did not deliver what a customer would have paid
        # for. Recorded as a failure so it cannot quietly lower the median.
        result.ok = not result.agent_errors
        if result.agent_errors:
            result.error = f"agents errored: {', '.join(result.agent_errors)}"
        return result
    except Exception as exc:  # noqa: BLE001 — one bad fixture must not stop the run.
        result.error = f"{type(exc).__name__}: {exc}"
        return result


def run_surface_scan(
    client: httpx.Client, fixture: dict[str, Any], email: str
) -> RunResult:
    """Time one free surface scan through the public web route.

    Surface scans make no LLM calls, so cost here is compute and egress rather
    than tokens; wall-clock and grade are what is worth recording. Note this
    creates a CRM contact for `email` — use an address that is obviously the
    harness so those entries are identifiable.
    """
    result = RunResult(
        id=fixture["id"],
        group="surface",
        kind="surface",
        target=fixture["target"],
        ok=False,
    )
    try:
        started = time.perf_counter()
        response = client.post(
            "/api/scan",
            json={"url": fixture["target"], "email": email},
            timeout=90,
        )
        result.wall_clock_s = round(time.perf_counter() - started, 2)
        if response.status_code != 200:
            result.error = f"scan returned {response.status_code}: {response.text[:200]}"
            return result
        report = response.json()
        result.grade = str(report.get("grade", ""))
        result.score = int(report.get("score", 0))
        result.ok = True
        return result
    except Exception as exc:  # noqa: BLE001
        result.error = f"{type(exc).__name__}: {exc}"
        return result


def dry_run_result(fixture: dict[str, Any]) -> RunResult:
    """Deterministic stand-in so the harness's shape can be checked offline."""
    return RunResult(
        id=fixture["id"],
        group=fixture["group"],
        kind=fixture.get("kind", "surface"),
        target=fixture["target"],
        ok=True,
        session_id="dry-run",
        wall_clock_s=1.0,
        input_tokens=1000,
        output_tokens=200,
        cost_usd=0.0 if fixture["group"] == "cache-hit" else 0.01,
        cost_if_uncached_usd=0.01,
    )


# ── Reporting ─────────────────────────────────────────────────────────────


def render_markdown(payload: dict[str, Any]) -> str:
    """Render a run into the table that goes into docs/UNIT-ECONOMICS.md."""
    s = payload["summary"]
    lines = [
        f"Measured {payload['started_at']} → {payload['finished_at']} "
        f"against `{payload['base_url']}`.",
        "",
        f"- Runs: **{s['runs_succeeded']} succeeded**, {s['runs_failed']} failed, "
        f"of {s['runs_attempted']} attempted",
        f"- Median cost per fresh deep scan: **${s['median_cost_usd']:.4f}**",
        f"- p95 cost per fresh deep scan: **${s['p95_cost_usd']:.4f}**",
        f"- Most expensive single scan: ${s['max_cost_usd']:.4f}",
        f"- Median wall-clock: {s['median_duration_s']}s (p95 {s['p95_duration_s']}s)",
        f"- Median tokens: {s['median_total_tokens']:,} (p95 {s['p95_total_tokens']:,})",
        f"- Median cost of a repeat (cache hit): ${s['median_cache_hit_cost_usd']:.4f}",
        f"- Total spent on this run: ${s['total_cost_usd']:.4f}",
        "",
        f"**PRD §4 gate (${s['gate_usd']:.2f} per deep scan), applied to p95: "
        f"{'PASS' if s['p95_within_gate'] else 'FAIL'}.**",
        "",
        "| Group | Runs | Median cost | Max cost | Median duration |",
        "|---|---|---|---|---|",
    ]
    for name, bucket in sorted(payload["summary"]["by_group"].items()):
        lines.append(
            f"| {name} | {bucket['runs']} | ${bucket['median_cost_usd']:.4f} | "
            f"${bucket['max_cost_usd']:.4f} | {bucket['median_duration_s']}s |"
        )
    if s["failures"]:
        lines += ["", "### Failures", "", "| Fixture | Target | Error |", "|---|---|---|"]
        for failure in s["failures"]:
            lines.append(
                f"| `{failure['id']}` | `{failure['target']}` | {failure['error']} |"
            )
    lines += [
        "",
        "Peak Railway memory and CPU are not in this table: `/evals` does not "
        "carry them, and inventing a number for a capacity decision would be "
        "worse than leaving the gap visible. Read them from the Railway "
        "dashboard for the window above.",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("STS_BACKEND_URL", ""))
    parser.add_argument("--site-url", default=os.getenv("STS_SITE_URL", ""))
    parser.add_argument("--token", default=os.getenv("STS_SERVICE_TOKEN", ""))
    parser.add_argument(
        "--surface-email",
        default=os.getenv("STS_SURFACE_SCAN_EMAIL", ""),
        help="Address used for surface scans. Creates a CRM contact — use an "
        "obviously-harness address so those entries are identifiable.",
    )
    parser.add_argument("--out", default="cost-results.json")
    parser.add_argument("--markdown-out", default="cost-results.md")
    parser.add_argument("--only", default="", help="Comma-separated group filter.")
    parser.add_argument("--skip-surface", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout", type=int, default=RUN_TIMEOUT_SECONDS)
    args = parser.parse_args(argv)

    fixtures = load_fixtures()
    groups = {g.strip() for g in args.only.split(",") if g.strip()}
    deep = [f for f in fixtures["deep"] if not groups or f["group"] in groups]
    want_surface = not args.skip_surface and (not groups or "surface" in groups)
    surface = fixtures["surface"] if want_surface else []

    started_at = datetime.now(timezone.utc).isoformat()
    results: list[RunResult] = []

    if args.dry_run:
        results = [dry_run_result(f) for f in deep + surface]
    else:
        if not args.base_url or not args.token:
            print(
                "error: --base-url and --token are required "
                "(STS_BACKEND_URL / STS_SERVICE_TOKEN)",
                file=sys.stderr,
            )
            return 2

        with httpx.Client(
            base_url=args.base_url.rstrip("/"),
            headers={SERVICE_AUTH_HEADER: args.token},
        ) as client:
            # Sequential on purpose. Concurrent runs would share the backend's
            # CPU and memory, so the wall-clock and RAM figures would describe
            # a load pattern no customer produces.
            for fixture in deep:
                print(f"→ {fixture['id']}  ({fixture['target']})", flush=True)
                result = run_fixture(client, fixture, timeout_s=args.timeout)
                status = "ok" if result.ok else f"FAILED — {result.error}"
                print(
                    f"  {status}  ${result.cost_usd:.4f}  {result.wall_clock_s}s  "
                    f"{result.input_tokens + result.output_tokens} tokens",
                    flush=True,
                )
                results.append(result)

        if surface:
            if not args.site_url or not args.surface_email:
                print(
                    "::warning::Skipping surface scans — --site-url and "
                    "--surface-email are required for them.",
                    flush=True,
                )
            else:
                with httpx.Client(base_url=args.site_url.rstrip("/")) as web:
                    for fixture in surface:
                        print(f"→ {fixture['id']}  ({fixture['target']})", flush=True)
                        result = run_surface_scan(web, fixture, args.surface_email)
                        print(
                            f"  {'ok' if result.ok else 'FAILED — ' + result.error}  "
                            f"{result.wall_clock_s}s",
                            flush=True,
                        )
                        results.append(result)

    payload = {
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "base_url": args.base_url or "(dry run)",
        "dry_run": args.dry_run,
        "summary": summarize(results),
        "runs": [asdict(r) for r in results],
    }

    Path(args.out).write_text(json.dumps(payload, indent=2))
    Path(args.markdown_out).write_text(render_markdown(payload))
    print("\n" + render_markdown(payload))

    # A failed fixture is a finding, not a broken job — a private repo that
    # returns 404 is exactly the kind of thing this run exists to discover.
    # The job only fails when nothing succeeded at all.
    return 0 if payload["summary"]["runs_succeeded"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
