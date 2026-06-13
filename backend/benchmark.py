"""
Caching eval benchmark for CyberSentinel AI agents.

Runs a representative sample of agent prompts:
  Pass 1 — uncached:  all calls hit the real API, results stored in cache
  Pass 2 — cached:    all calls served from in-memory cache

Prints a comparison table: tokens, cost (USD), latency per agent + totals.

Usage:
    python benchmark.py                        # uses OPENAI_API_KEY env var
    python benchmark.py --model gpt-4o-mini    # cheaper model for testing
    python benchmark.py --dry-run              # mock API (no key needed)
"""

import argparse
import json
import os
import random
import time

from llm_cache import LLMCache
from llm_client import CachingLLMClient
from eval_tracker import EvalTracker


# ── Sample inputs (representative of each agent's typical prompt) ──────────

SAMPLE_LOGS = [
    "2024-01-15T10:23:45 WARN  sshd[2341]: Failed password for root from 192.168.1.100",
    "2024-01-15T10:23:46 WARN  sshd[2342]: Failed password for root from 192.168.1.100",
    "2024-01-15T10:23:47 WARN  sshd[2343]: Failed password for root from 192.168.1.100",
    "2024-01-15T10:23:48 WARN  sshd[2344]: Failed password for admin from 10.0.0.55",
    "2024-01-15T10:24:01 ERROR kernel: port scan detected from 203.0.113.42",
    "2024-01-15T10:24:10 INFO  nginx: 200 GET /api/health 0.002s",
    "2024-01-15T10:24:15 ERROR auth: multiple failed logins for user 'jenkins'",
]

AGENT_PROMPTS = [
    {
        "agent": "log_monitor",
        "system": (
            "You are a cybersecurity log analysis agent. "
            "Identify anomalies, classify severity (LOW/MEDIUM/HIGH/CRITICAL), "
            "and return structured JSON. Be concise."
        ),
        "user": (
            f"Analyze these logs and return JSON with keys: "
            f"anomalies (list), severity_map (dict).\n\nLogs:\n"
            + "\n".join(SAMPLE_LOGS)
        ),
    },
    {
        "agent": "threat_intel",
        "system": (
            "You are a threat intelligence agent. Given suspicious IPs and events, "
            "correlate with known threat data and CVEs. Return structured JSON."
        ),
        "user": (
            "Suspicious IPs: ['192.168.1.100', '203.0.113.42', '10.0.0.55']. "
            "Anomalies: SSH brute force, port scan. "
            "Return JSON with keys: cve_matches (list), threat_score (0-100)."
        ),
    },
    {
        "agent": "vuln_scanner",
        "system": (
            "You are a vulnerability scanner agent. Assess the attack surface "
            "described and identify OWASP top-10 risks. Return structured JSON."
        ),
        "user": (
            "Services exposed: SSH (port 22), HTTP (port 80), Jenkins (port 8080). "
            "Known anomalies: brute force on SSH, unauthenticated Jenkins. "
            "Return JSON with keys: vulnerabilities (list), risk_level (str)."
        ),
    },
    {
        "agent": "incident_response",
        "system": (
            "You are an incident response agent. Generate a prioritised action plan "
            "and runbook in Markdown. Be specific and actionable."
        ),
        "user": (
            "Threat score: 72. Risk level: HIGH. Vulnerabilities: "
            "['CVE-2023-1234 (SSH)', 'Unauthenticated Jenkins RCE']. "
            "Return JSON with keys: action_plan (list of strings), runbook_md (string)."
        ),
    },
    {
        "agent": "policy_checker",
        "system": (
            "You are a compliance policy agent. Map the security gaps to "
            "NIST CSF 2.0, SOC 2 Type II, and ISO 27001 controls. Return structured JSON."
        ),
        "user": (
            "Gaps: no MFA on SSH, unauthenticated admin interface, no log retention policy. "
            "Return JSON with keys: compliance_gaps (list of dicts), compliance_score (0-100)."
        ),
    },
]


# ── Mock client for --dry-run ────────────────────────────────────────────────

class MockLLMClient:
    """Simulates API calls without a real key. Used with --dry-run."""

    def __init__(self, cache: LLMCache | None, tracker: EvalTracker, run_label: str):
        """Configure mock client with shared cache and eval tracker."""
        self._cache = cache
        self._tracker = tracker
        self.run_label = run_label

    def chat(self, agent: str, model: str, messages: list[dict], **_):
        """Simulate an LLM chat completion with optional cache lookup."""
        from llm_cache import CacheEntry

        if self._cache is not None:
            entry = self._cache.get(model, messages)
            if entry is not None:
                meta_dict = {
                    "input_tokens": entry.input_tokens,
                    "output_tokens": entry.output_tokens,
                    "latency_ms": 1.0,
                    "cache_hit": True,
                }
                if self._tracker:
                    self._tracker.record(
                        agent=agent, model=model,
                        input_tokens=entry.input_tokens,
                        output_tokens=entry.output_tokens,
                        latency_ms=1.0, cache_hit=True,
                        run_label=self.run_label,
                    )
                from llm_client import CallMeta
                return entry.response, CallMeta(**meta_dict)

        # Simulate latency proportional to prompt length
        prompt_len = sum(len(m.get("content", "")) for m in messages)
        latency_ms = 400 + random.gauss(0, 50) + prompt_len * 0.15
        time.sleep(latency_ms / 1000)

        in_tok = max(100, prompt_len // 4)
        out_tok = random.randint(80, 250)
        response = {
            "choices": [{"message": {"content": f'{{"mock": "response for {agent}"}}'}}],
            "usage": {"prompt_tokens": in_tok, "completion_tokens": out_tok},
        }

        if self._cache is not None:
            self._cache.set(
                model, messages,
                CacheEntry(response=response, input_tokens=in_tok,
                           output_tokens=out_tok, latency_ms=latency_ms),
            )
        if self._tracker:
            self._tracker.record(
                agent=agent, model=model,
                input_tokens=in_tok, output_tokens=out_tok,
                latency_ms=latency_ms, cache_hit=False,
                run_label=self.run_label,
            )
        from llm_client import CallMeta
        return response, CallMeta(input_tokens=in_tok, output_tokens=out_tok,
                                  latency_ms=latency_ms, cache_hit=False)

    def extract_text(self, response: dict) -> str:
        """Extract assistant message text from a mock response dict."""
        try:
            return response["choices"][0]["message"]["content"]
        except (KeyError, IndexError):
            return ""


# ── Runner ───────────────────────────────────────────────────────────────────

def run_pipeline(client, model: str, label: str) -> None:
    """Run all agent prompts through the given client and print per-call stats."""
    print(f"\n  ▶ Running pipeline [{label}] ...")
    for spec in AGENT_PROMPTS:
        messages = [
            {"role": "system", "content": spec["system"]},
            {"role": "user", "content": spec["user"]},
        ]
        _resp, meta = client.chat(
            agent=spec["agent"],
            model=model,
            messages=messages,
            temperature=0.0,
            max_tokens=512,
        )
        hit = "✓ cache" if meta.cache_hit else "  miss "
        print(
            f"    [{hit}] {spec['agent']:<22}  "
            f"{meta.input_tokens:>5} in / {meta.output_tokens:>4} out  "
            f"  {meta.latency_ms:>7.1f} ms"
        )


def main():
    """CLI entry point: uncached vs cached benchmark comparison."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gpt-4o-mini")
    parser.add_argument("--dry-run", action="store_true",
                        help="Use mock responses (no API key needed)")
    parser.add_argument("--api-key", default=os.environ.get("OPENAI_API_KEY"))
    parser.add_argument("--base-url", default=None,
                        help="Override base URL (e.g. OpenRouter)")
    args = parser.parse_args()

    tracker = EvalTracker()
    shared_cache = LLMCache(max_size=128)

    def make_client(cache, label):
        if args.dry_run:
            return MockLLMClient(cache=cache, tracker=tracker, run_label=label)
        return CachingLLMClient(
            api_key=args.api_key,
            base_url=args.base_url,
            cache=cache,
            tracker=tracker,
            run_label=label,
        )

    print("\n" + "═" * 60)
    print("  CyberSentinel AI — Caching Eval Benchmark")
    print(f"  Model: {args.model}  |  Dry-run: {args.dry_run}")
    print("═" * 60)

    # Pass 1: uncached — no cache, all calls hit the API
    uncached_client = make_client(cache=None, label="uncached")
    run_pipeline(uncached_client, args.model, "uncached")

    # Warm the shared cache by running once with it enabled
    # (re-use the same tracker labels but prime the cache)
    warming_client = make_client(cache=shared_cache, label="_warm")
    # run silently to fill cache
    for spec in AGENT_PROMPTS:
        messages = [
            {"role": "system", "content": spec["system"]},
            {"role": "user", "content": spec["user"]},
        ]
        warming_client.chat(agent=spec["agent"], model=args.model,
                            messages=messages, temperature=0.0, max_tokens=512)
    # Remove warm-up records from tracker
    tracker.records = [r for r in tracker.records if r.run_label != "_warm"]

    # Pass 2: cached — all calls should be cache hits
    cached_client = make_client(cache=shared_cache, label="cached")
    run_pipeline(cached_client, args.model, "cached")

    # Print comparison
    tracker.print_comparison_table()

    print(f"  Cache stats: {shared_cache.hits} hits / "
          f"{shared_cache.misses} misses  "
          f"({shared_cache.hit_rate:.0%} hit rate)\n")


if __name__ == "__main__":
    main()
