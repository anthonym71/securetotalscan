"""
Per-call metric tracking for LLM agent calls.

Records: agent name, model, input/output tokens, cost, latency, cache hit.
Provides summary tables comparing cached vs uncached runs.
"""

import time
from dataclasses import dataclass, field
from typing import Literal

# GPT-4o pricing per 1M tokens (as of June 2026)
PRICING: dict[str, dict[str, float]] = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    # OpenAI auto prompt-cache discount (server-side, applied automatically for >1024 token inputs)
    "gpt-4o-cached-input": {"input": 1.25},
}


def compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return estimated USD cost for a call."""
    rates = PRICING.get(model, PRICING["gpt-4o"])
    input_cost = (input_tokens / 1_000_000) * rates["input"]
    output_cost = (output_tokens / 1_000_000) * rates["output"]
    return input_cost + output_cost


@dataclass
class CallRecord:
    """Metrics captured for a single LLM API call."""

    agent: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: float
    cache_hit: bool
    run_label: str = ""   # "uncached" | "cached" etc.


class EvalTracker:
    """Accumulates per-call LLM metrics for benchmark comparison."""

    def __init__(self):
        """Initialize an empty call record list."""
        self.records: list[CallRecord] = []

    def record(
        self,
        agent: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: float,
        cache_hit: bool,
        run_label: str = "",
    ) -> CallRecord:
        """Append a call record; cache hits are recorded with zero cost."""
        cost = 0.0 if cache_hit else compute_cost(model, input_tokens, output_tokens)
        rec = CallRecord(
            agent=agent,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            latency_ms=latency_ms,
            cache_hit=cache_hit,
            run_label=run_label,
        )
        self.records.append(rec)
        return rec

    # ── Summary helpers ──────────────────────────────────────────────────────

    def summary_by_label(self) -> dict[str, dict]:
        """Aggregate stats grouped by run_label."""
        groups: dict[str, list[CallRecord]] = {}
        for r in self.records:
            groups.setdefault(r.run_label, []).append(r)

        result = {}
        for label, recs in groups.items():
            total_in = sum(r.input_tokens for r in recs)
            total_out = sum(r.output_tokens for r in recs)
            total_cost = sum(r.cost_usd for r in recs)
            total_lat = sum(r.latency_ms for r in recs)
            hits = sum(1 for r in recs if r.cache_hit)
            result[label] = {
                "calls": len(recs),
                "input_tokens": total_in,
                "output_tokens": total_out,
                "total_tokens": total_in + total_out,
                "cost_usd": total_cost,
                "total_latency_ms": total_lat,
                "avg_latency_ms": total_lat / len(recs),
                "cache_hits": hits,
                "cache_hit_rate": hits / len(recs),
            }
        return result

    def print_comparison_table(self) -> None:
        """Print call-by-call and summary tables to stdout."""
        summary = self.summary_by_label()
        if not summary:
            print("No records yet.")
            return

        # Per-call table
        print("\n" + "═" * 90)
        print("  CALL-BY-CALL METRICS")
        print("═" * 90)
        print(
            f"  {'Agent':<22} {'Run':<12} {'In Tok':>8} {'Out Tok':>8} "
            f"{'Cost $':>9} {'Latency ms':>11} {'Cache':>7}"
        )
        print("  " + "─" * 86)
        for r in self.records:
            hit_str = "✓ HIT" if r.cache_hit else "MISS"
            print(
                f"  {r.agent:<22} {r.run_label:<12} {r.input_tokens:>8,} {r.output_tokens:>8,} "
                f"  ${r.cost_usd:>7.5f} {r.latency_ms:>10.1f}  {hit_str:>7}"
            )

        # Summary table
        print("\n" + "═" * 70)
        print("  SUMMARY BY RUN")
        print("═" * 70)
        labels = list(summary.keys())
        header = f"  {'Metric':<28}"
        for lbl in labels:
            header += f"  {lbl:>16}"
        print(header)
        print("  " + "─" * 66)

        def row(name: str, *vals):
            """Format one summary table row."""
            line = f"  {name:<28}"
            for v in vals:
                line += f"  {v:>16}"
            print(line)

        row("API calls", *[str(summary[l]["calls"]) for l in labels])
        row("Input tokens", *[f"{summary[l]['input_tokens']:,}" for l in labels])
        row("Output tokens", *[f"{summary[l]['output_tokens']:,}" for l in labels])
        row("Total tokens", *[f"{summary[l]['total_tokens']:,}" for l in labels])
        row("Total cost (USD)", *[f"${summary[l]['cost_usd']:.5f}" for l in labels])
        row("Total latency (ms)", *[f"{summary[l]['total_latency_ms']:.0f}" for l in labels])
        row("Avg latency/call (ms)", *[f"{summary[l]['avg_latency_ms']:.1f}" for l in labels])
        row("Cache hits", *[f"{summary[l]['cache_hits']}/{summary[l]['calls']}" for l in labels])

        # Savings callout (if both labels present)
        if "uncached" in summary and "cached" in summary:
            u, c = summary["uncached"], summary["cached"]
            cost_saved = u["cost_usd"] - c["cost_usd"]
            lat_saved = u["total_latency_ms"] - c["total_latency_ms"]
            pct_cost = (cost_saved / u["cost_usd"] * 100) if u["cost_usd"] else 0
            pct_lat = (lat_saved / u["total_latency_ms"] * 100) if u["total_latency_ms"] else 0
            print("\n" + "═" * 70)
            print("  💰  SAVINGS (cached vs uncached)")
            print("  " + "─" * 66)
            print(f"  Cost saved:     ${cost_saved:.5f}  ({pct_cost:.1f}% cheaper)")
            print(f"  Latency saved:  {lat_saved:.0f} ms  ({pct_lat:.1f}% faster)")
            print("═" * 70 + "\n")
