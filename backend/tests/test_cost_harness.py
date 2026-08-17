"""Tests for the deep-scan cost harness.

The aggregation is tested rather than eyeballed because its output feeds a
pricing decision: whether the $4.99 tier can include a deep scan. A quietly
wrong percentile would move that decision without anyone noticing.
"""

import json

import pytest

import cost_harness as ch


def _result(**kwargs) -> ch.RunResult:
    base = dict(id="x", group="small", kind="github", target="t", ok=True)
    base.update(kwargs)
    return ch.RunResult(**base)


# ── Fixture file ──────────────────────────────────────────────────────────


def test_fixture_file_parses_and_is_complete():
    fixtures = ch.load_fixtures()
    assert fixtures["deep"], "no deep fixtures"
    assert fixtures["surface"], "no surface fixtures"
    for fixture in fixtures["deep"] + fixtures["surface"]:
        assert fixture["id"]
        assert fixture["target"]
        assert fixture["group"]
        # Every fixture states why it is there — otherwise a later reader
        # cannot tell a deliberate choice from an arbitrary one.
        assert fixture["why"]


def test_fixture_ids_are_unique():
    fixtures = ch.load_fixtures()
    ids = [f["id"] for f in fixtures["deep"] + fixtures["surface"]]
    assert len(ids) == len(set(ids))


def test_only_the_cache_hit_fixture_repeats_a_target():
    """A repeated target measures a cache hit, not a scan.

    llm_cache.py keys on the prompt, so a second run of the same repo costs
    near zero. That is measured on purpose in the `cache-hit` group; anywhere
    else it would silently understate the cost of a real scan.
    """
    deep = ch.load_fixtures()["deep"]
    seen: dict[str, str] = {}
    for fixture in deep:
        target = fixture["target"]
        if target in seen:
            assert fixture["group"] == "cache-hit", (
                f"{fixture['id']} repeats {seen[target]} but is not in the "
                "cache-hit group"
            )
            assert fixture.get("repeat_of") == seen[target]
        else:
            seen[target] = fixture["id"]


def test_cache_hit_fixture_runs_after_the_run_it_repeats():
    deep = ch.load_fixtures()["deep"]
    order = {f["id"]: i for i, f in enumerate(deep)}
    for fixture in deep:
        origin = fixture.get("repeat_of")
        if origin:
            assert order[origin] < order[fixture["id"]]


def test_every_deep_fixture_maps_to_an_endpoint():
    for fixture in ch.load_fixtures()["deep"]:
        path, body = ch._start_payload(fixture)
        assert path.startswith("/analyze")
        assert body


def test_unknown_kind_is_rejected():
    with pytest.raises(ValueError):
        ch._start_payload({"kind": "telepathy", "target": "x"})


# ── Percentiles ───────────────────────────────────────────────────────────


def test_percentile_of_empty_is_zero():
    assert ch.percentile([], 50) == 0.0


def test_percentile_of_one_value_is_that_value():
    # p95 of a single measurement is that measurement — statistics.quantiles
    # raises here, which is why this is hand-rolled.
    assert ch.percentile([0.42], 95) == 0.42


def test_percentile_matches_linear_interpolation():
    values = [1.0, 2.0, 3.0, 4.0]
    assert ch.percentile(values, 0) == 1.0
    assert ch.percentile(values, 50) == 2.5
    assert ch.percentile(values, 100) == 4.0


def test_percentile_ignores_input_order():
    assert ch.percentile([3.0, 1.0, 2.0], 50) == ch.percentile([1.0, 2.0, 3.0], 50)


# ── Aggregation ───────────────────────────────────────────────────────────


def test_cache_hits_are_excluded_from_the_median():
    """A repeat scan is near-free and must not drag the median down.

    The median being priced is the cost of a customer's *first* scan.
    """
    runs = [
        _result(id="a", cost_usd=0.10),
        _result(id="b", cost_usd=0.20),
        _result(id="c", cost_usd=0.30),
        _result(id="repeat", group="cache-hit", cost_usd=0.0),
    ]
    summary = ch.summarize(runs)
    assert summary["median_cost_usd"] == 0.20
    assert summary["fresh_runs"] == 3
    assert summary["cache_hit_runs"] == 1
    assert summary["median_cache_hit_cost_usd"] == 0.0


def test_failed_runs_are_excluded_from_the_median_but_counted():
    runs = [
        _result(id="a", cost_usd=0.10),
        _result(id="b", cost_usd=0.20),
        _result(id="bad", ok=False, cost_usd=0.90, error="boom"),
    ]
    summary = ch.summarize(runs)
    assert summary["runs_attempted"] == 3
    assert summary["runs_succeeded"] == 2
    assert summary["runs_failed"] == 1
    assert summary["median_cost_usd"] == 0.15
    assert summary["failures"][0]["id"] == "bad"


def test_total_cost_includes_failed_runs():
    """A run that failed still spent money. The bill does not care."""
    runs = [_result(cost_usd=0.10), _result(id="bad", ok=False, cost_usd=0.05)]
    assert ch.summarize(runs)["total_cost_usd"] == 0.15


def test_gate_is_applied_to_p95_not_the_median():
    """A cheap median must not rescue an expensive tail.

    Sixteen scans at $0.10 and four at $2.00: the median says the tier is
    comfortably affordable, and one scan in five loses money. The gate has to
    see the second thing, which is why it reads p95 rather than the median.
    """
    runs = [_result(id=f"cheap{i}", cost_usd=0.10) for i in range(16)]
    runs += [_result(id=f"dear{i}", cost_usd=2.00) for i in range(4)]
    summary = ch.summarize(runs)
    assert summary["median_cost_usd"] < ch.DEEP_SCAN_COST_GATE_USD
    assert summary["p95_cost_usd"] > ch.DEEP_SCAN_COST_GATE_USD
    assert summary["p95_within_gate"] is False


def test_gate_passes_when_p95_is_under():
    runs = [_result(id=str(i), cost_usd=0.02) for i in range(10)]
    assert ch.summarize(runs)["p95_within_gate"] is True


def test_gate_does_not_pass_on_an_empty_run():
    """No data is not the same as a pass."""
    assert ch.summarize([])["p95_within_gate"] is False


def test_group_breakdown_is_per_group():
    runs = [
        _result(id="s1", group="small", cost_usd=0.01),
        _result(id="s2", group="small", cost_usd=0.03),
        _result(id="l1", group="large", cost_usd=0.20),
    ]
    by_group = ch.summarize(runs)["by_group"]
    assert by_group["small"]["runs"] == 2
    assert by_group["small"]["median_cost_usd"] == 0.02
    assert by_group["large"]["max_cost_usd"] == 0.20


# ── Rendering ─────────────────────────────────────────────────────────────


def test_markdown_renders_without_data():
    payload = {
        "started_at": "2026-08-17T00:00:00Z",
        "finished_at": "2026-08-17T00:10:00Z",
        "base_url": "https://example.test",
        "summary": ch.summarize([]),
    }
    rendered = ch.render_markdown(payload)
    assert "FAIL" in rendered
    assert "Railway" in rendered


def test_markdown_lists_failures():
    payload = {
        "started_at": "a",
        "finished_at": "b",
        "base_url": "c",
        "summary": ch.summarize(
            [_result(id="own-securetotalscan", ok=False, error="start returned 404")]
        ),
    }
    rendered = ch.render_markdown(payload)
    assert "own-securetotalscan" in rendered
    assert "404" in rendered


# ── Dry run ───────────────────────────────────────────────────────────────


def test_dry_run_produces_a_complete_report(tmp_path):
    out = tmp_path / "results.json"
    md = tmp_path / "results.md"
    exit_code = ch.main(
        ["--dry-run", "--out", str(out), "--markdown-out", str(md)]
    )
    assert exit_code == 0
    payload = json.loads(out.read_text())
    assert payload["dry_run"] is True
    assert payload["summary"]["runs_succeeded"] == len(payload["runs"])
    assert md.read_text()


def test_group_filter_selects_a_subset(tmp_path):
    out = tmp_path / "results.json"
    ch.main(
        [
            "--dry-run",
            "--only",
            "small",
            "--skip-surface",
            "--out",
            str(out),
            "--markdown-out",
            str(tmp_path / "r.md"),
        ]
    )
    payload = json.loads(out.read_text())
    assert {run["group"] for run in payload["runs"]} == {"small"}


def test_live_run_refuses_without_credentials(tmp_path, monkeypatch):
    """Never silently measure nothing: no token means exit 2, not exit 0."""
    monkeypatch.delenv("STS_SERVICE_TOKEN", raising=False)
    monkeypatch.delenv("STS_BACKEND_URL", raising=False)
    exit_code = ch.main(
        ["--out", str(tmp_path / "o.json"), "--markdown-out", str(tmp_path / "o.md")]
    )
    assert exit_code == 2
