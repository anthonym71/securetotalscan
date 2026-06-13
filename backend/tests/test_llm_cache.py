"""Tests for in-memory LLM response cache behavior."""

import time

from llm_cache import LLMCache, CacheEntry

MODEL = "gpt-4o-mini"
MSGS = [{"role": "user", "content": "hello"}]


def _entry(**kwargs) -> CacheEntry:
    return CacheEntry(
        response={}, input_tokens=10, output_tokens=5, latency_ms=100, **kwargs
    )


def test_cache_miss_on_empty():
    c = LLMCache()
    assert c.get(MODEL, MSGS) is None
    assert c.misses == 1


def test_cache_hit_after_set():
    c = LLMCache()
    c.set(MODEL, MSGS, _entry())
    assert c.get(MODEL, MSGS) is not None
    assert c.hits == 1


def test_lru_eviction():
    c = LLMCache(max_size=2)
    for i in range(3):
        c.set(MODEL, [{"role": "user", "content": str(i)}], _entry())
    assert c.size == 2


def test_ttl_expiry():
    c = LLMCache(ttl_seconds=0.05)
    c.set(MODEL, MSGS, _entry())
    time.sleep(0.1)
    assert c.get(MODEL, MSGS) is None
    assert c.misses == 1


def test_hit_rate():
    c = LLMCache()
    c.set(MODEL, MSGS, _entry())
    c.get(MODEL, MSGS)
    c.get(MODEL, [{"role": "user", "content": "other"}])
    assert c.hit_rate == 0.5


def test_different_messages_different_keys():
    c = LLMCache()
    msgs_a = [{"role": "user", "content": "A"}]
    msgs_b = [{"role": "user", "content": "B"}]
    c.set(MODEL, msgs_a, _entry())
    assert c.get(MODEL, msgs_b) is None
