# CyberSentinel AI — Backend

Python FastAPI service that orchestrates a seven-agent LangGraph security pipeline. It analyzes logs, scans GitHub repositories and Docker Hub images, streams live agent progress over SSE, and exposes session eval metrics.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set OPENROUTER_API_KEY, optional GIT_TOKEN
./scripts/install-trivy.sh   # enables Docker CVE scanning via Trivy
.venv/bin/python -m uvicorn main:app --reload --port 8000
```

Verify Trivy is ready:

```bash
curl http://localhost:8000/health/trivy
# → {"available": true, "db_ready": true, ...}
```

Run tests:

```bash
.venv/bin/python -m pytest tests/ -q
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FastAPI (main.py)                                          │
│  REST + SSE · session store · background analysis tasks     │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
  session_events.py   orchestrator.py    session_evals.py
  (SSE queues)        (LangGraph)        (metrics API)
         │                  │
         │                  ▼
         │     LogMonitor → ThreatIntel → VulnScanner → DockerScanner
         │              → IncidentResponse → PolicyChecker → SlackNotifier
         │                  │
         │                  ▼
         └──────────► SecurityState (shared TypedDict)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
         agents/                      tools/
    (pure node functions)      (log_parser, github_scanner,
                                 nvd_api, abuseipdb, docker_scanner, rag)
              │
              ▼
         llm_client.py + llm_cache.py  (Incident Response only)
```

### Request lifecycle

1. Client calls `POST /analyze`, `/analyze/upload`, `/analyze/github`, or `/analyze/docker`.
2. FastAPI creates a `session_id`, event queue, and eval session; starts analysis in a background thread via `asyncio.to_thread`.
3. LangGraph runs agents sequentially; each wrapper emits `running` / `done` / `error` to the SSE queue.
4. Client subscribes to `GET /stream/{session_id}` for live updates.
5. On `pipeline` `done`, client fetches `GET /report/{session_id}` for the full `SecurityState`.

### Agent pipeline

| Agent | Type | Role |
|-------|------|------|
| `log_monitor` | Deterministic | Parse logs, detect anomalies, attach remediation hints |
| `threat_intel` | External API | NVD CVE lookup, AbuseIPDB reputation → `threat_score` |
| `vuln_scanner` | Deterministic + HTTP | OWASP mapping, optional header checks, GitHub static scan |
| `docker_scanner` | External API + Trivy | Docker Hub metadata checks, Trivy CVE scan (skips if no image) |
| `incident_response` | LLM (cached) | OpenRouter action plan + RAG context; deterministic fallback if LLM fails |
| `policy_checker` | Rule-based + RAG | Map anomalies + code/docker findings to NIST / SOC 2 / ISO 27001 gaps |
| `slack_notifier` | External webhook | Post summary alert to Slack; skips silently when no webhook configured |

Agents do not call each other directly. They read and write a single **`SecurityState`** object passed through the graph.

## Software engineering patterns

### Shared state (blackboard pattern)

All agents operate on one `SecurityState` `TypedDict` defined in `state.py`. Each node receives state, returns an updated copy (`{**state, ...}`), and LangGraph merges it forward. This keeps agents decoupled while preserving a single source of truth for the report.

```python
# state.py — typed contract for the entire pipeline
class SecurityState(TypedDict):
    raw_logs: list[str]
    anomalies: list[dict]
    code_findings: list[dict]
    action_plan: list[str]
    ...
```

### Pipeline / chain of responsibility

`orchestrator.py` defines a linear LangGraph: each agent handles one concern and passes state to the next. Order is fixed in `AGENTS` and `build_graph()` — no dynamic routing, which keeps the hackathon demo predictable and testable.

### Cross-cutting wrapper (decorator-style)

`_wrap()` in `orchestrator.py` wraps every agent node with shared behavior without polluting agent logic:

- Emit SSE `running` / `done` / `error`
- Record latency via `session_evals`
- Centralized error signaling

```python
def _wrap(agent_name: str, fn):
    def node(state: SecurityState) -> SecurityState:
        emit_sync(session_id, agent_name, "running")
        ...
        return fn(state)
    return node
```

This is the **decorator pattern** applied at graph construction time.

### Separation of concerns: agents vs tools

| Layer | Responsibility |
|-------|----------------|
| `agents/` | Orchestration units — map inputs/outputs to `SecurityState` |
| `tools/` | Reusable capabilities — parsing, HTTP clients, pattern scanners |

Agents stay thin; tools are unit-tested independently (e.g. `log_parser.py`, `github_scanner.py`).

### Strategy-like input modes

`main.py` loads data differently per source (`synthetic`, `system`, `upload`, `github`, `docker`) but always feeds the same pipeline. The strategy varies at the API boundary; downstream agents remain unchanged.

### Adapter + cache-aside (LLM layer)

`CachingLLMClient` adapts the OpenAI SDK to OpenRouter and adds an optional in-memory cache:

1. Check `LLMCache` (SHA-256 key of `model + messages`)
2. On hit → return cached response (~1 ms, $0)
3. On miss → call API, store result, record metrics

Only **Incident Response** uses the LLM. Other agents are deterministic or call external APIs directly.

```python
# llm_cache.py — LRU cache-aside with hit/miss counters
entry = cache.get(model, messages)
if entry: return entry.response  # cache hit
response = api.call(...)
cache.set(model, messages, entry)
```

### Observer / pub-sub (SSE)

`session_events.py` holds a thread-safe `queue.Queue` per session. Agents publish events synchronously; the async SSE endpoint consumes them. Producers (LangGraph thread) and consumers (FastAPI stream) are decoupled.

### Graceful degradation / fallback

| Location | Behavior |
|----------|----------|
| `incident_response.py` | LLM failure → `_fallback_action_plan()` from anomalies, CVEs, code findings |
| `scan_github_repo_safe()` | HTTP errors → `{ "error": "..." }` instead of raising |
| `main.py` system logs | Unreadable host logs → bundled synthetic logs with metadata |
| External APIs | Partial results; pipeline continues |

### Safe factory

`make_initial_state()` centralizes default values so every run starts from a consistent empty state. Tests and the orchestrator both use this factory.

### Observability / evals

Two complementary layers:

- **`eval_tracker.py`** — low-level per-LLM-call tokens, cost, latency (used by `benchmark.py`)
- **`session_evals.py`** — per-session, per-agent metrics exposed via `/evals` API

Agent wrappers record latency for all agents; LLM calls additionally record token usage and cache hits.

### Static analysis with false-positive control

`github_scanner.py` applies regex rules for OWASP and Terraform patterns. It skips test paths and meta-lines (pattern definitions inside the scanner itself) to avoid self-scan noise.

## Project structure

```
backend/
├── main.py              # FastAPI app, routes, log loading
├── orchestrator.py      # LangGraph graph + agent wrappers
├── state.py             # SecurityState TypedDict
├── session_events.py    # SSE event queues
├── session_evals.py     # Session metrics + /evals endpoints
├── llm_cache.py         # In-memory LRU LLM cache
├── llm_client.py        # CachingLLMClient adapter
├── eval_tracker.py      # Token/cost/latency tracking
├── benchmark.py         # Cached vs uncached benchmark CLI
├── agents/
│   ├── log_monitor.py
│   ├── threat_intel.py
│   ├── vuln_scanner.py
│   ├── docker_scanner.py
│   ├── incident_response.py
│   ├── policy_checker.py
│   └── slack_notifier.py
├── tools/
│   ├── log_parser.py
│   ├── github_scanner.py
│   ├── nvd_api.py
│   ├── abuseipdb.py
│   ├── docker_scanner.py
│   └── rag.py
├── data/
│   ├── synthetic_logs.json
│   └── knowledge/chunks.json
└── tests/
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/analyze` | Start analysis (`source`: `synthetic` \| `system`) |
| POST | `/analyze/upload` | Upload `.log` / `.txt` (max 10 MB) |
| POST | `/analyze/github` | Scan GitHub repo (`repo_url`, optional `include_logs`) |
| POST | `/analyze/docker` | Scan Docker Hub image (`image_url`) with Trivy CVE scan |
| GET | `/health/trivy` | Trivy install / DB readiness check |
| GET | `/stream/{session_id}` | SSE agent progress stream |
| GET | `/report/{session_id}` | Full report JSON |
| GET | `/agents/status/{session_id}` | Agent status snapshot |
| GET | `/evals` | All session eval summaries |
| GET | `/evals/{session_id}` | Detailed eval for one session |

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Recommended | LLM action plans via OpenRouter |
| `GIT_TOKEN` | Recommended | GitHub API rate limits for repo scans |
| `NVD_API_KEY` | Optional | NVD CVE API |
| `ABUSEIPDB_API_KEY` | Optional | IP reputation lookups |
| `TRIVY_PATH` | Optional | Path to Trivy binary (auto-detected if on `PATH`) |
| `TRIVY_CACHE_DIR` | Optional | Trivy DB cache directory (default: platform cache) |
| `TRIVY_WARMUP` | Optional | Pre-download vuln DB on startup (`true` default) |
| `TRIVY_SEVERITIES` | Optional | CVE severities to report (default: `CRITICAL,HIGH,MEDIUM`) |
| `TRIVY_MAX_CVES` | Optional | Max CVEs returned per scan (default: `25`) |

## Trivy CVE scanning

The **Docker Scanner** agent runs [Trivy](https://github.com/aquasecurity/trivy) against Docker Hub images for OS and library CVEs.

**Local install:**

```bash
./scripts/install-trivy.sh
```

**Production (Railway):** deploy with `backend/nixpacks.toml` + `backend/railway.toml` (Root Directory = `backend`). Trivy installs at build time. Docker alternative: `Dockerfile.trivy`.

**Verify:**

```bash
curl http://localhost:8000/health/trivy
```

When Trivy runs successfully, findings appear with `"source": "trivy"` and the dashboard shows a green CVE summary banner.

## LLM caching

```bash
# Benchmark cached vs uncached (dry run needs no API key)
.venv/bin/python benchmark.py --dry-run
```

Cache details:

- **Implementation:** `LLMCache` — `OrderedDict` LRU, max 256 entries
- **Key:** `SHA-256(model + JSON-serialized messages)`
- **Scope:** Incident Response agent only
- **Observability:** `cache_hit` recorded in session evals

Identical synthetic demo runs typically achieve **100% cache hits** on the second execution.

## Testing

65 tests covering agents, tools, API, RAG, Docker, cache, orchestrator, and GitHub scanner (including Terraform patterns and false-positive skips).

```bash
.venv/bin/python -m pytest tests/ -q
.venv/bin/python -m pytest tests/test_orchestrator.py -q   # full pipeline
.venv/bin/python -m pytest tests/test_github_scanner.py -q
```

## Related docs

- [../README.md](../README.md) — project overview
- [../docs/architecture.md](../docs/architecture.md) — full system architecture
- [../docs/superpowers/specs/2026-06-12-cybersentinel-ai-design.md](../docs/superpowers/specs/2026-06-12-cybersentinel-ai-design.md) — design spec
