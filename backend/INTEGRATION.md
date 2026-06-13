# Backend — agent engine (FastAPI + LangGraph)

This folder holds the five-agent deep-analysis backend. It is sourced from
[dheerajrvanteru/c7-hackathon](https://github.com/dheerajrvanteru/c7-hackathon)
(`backend/`), used with permission, and integrated into Secure Total Scan.
See [`../docs/ATTRIBUTION.md`](../docs/ATTRIBUTION.md).

## Bringing the code in

The backend was not committed here yet because it must be pulled from the
upstream repo on a networked machine. Run this once, from the repo root:

```bash
# Pull only the backend/ folder from the upstream repo into ./backend
npx degit dheerajrvanteru/c7-hackathon/backend backend

# OR, to keep upstream history for future updates, use a subtree:
git remote add c7 https://github.com/dheerajrvanteru/c7-hackathon.git
git fetch c7
git read-tree --prefix=backend/ -u c7/main:backend
```

## Run it locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt
copy .env.example .env          # then fill in keys
python -m uvicorn main:app --reload --port 8000
```

The web app talks to it via `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

## Environment variables

| Var | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | LLM calls (GPT-4o via OpenRouter) — this is the chosen provider |
| `GITHUB_TOKEN` | Higher GitHub API rate limits for repo scans |
| `NVD_API_KEY` | CVE lookups (optional) |
| `ABUSEIPDB_API_KEY` | IP reputation (optional) |

## Key endpoints (consumed by the web app)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/analyze` | POST | Start a log analysis |
| `/analyze/github` | POST | Scan a GitHub repository |
| `/stream/{session_id}` | GET | SSE stream of live agent progress |
| `/report/{session_id}` | GET | Full analysis report |
| `/evals/{session_id}` | GET | Token usage, cost, cache hits |

## Deploy

Deploy this folder to Railway. Copy the public HTTPS URL into the web app's
`NEXT_PUBLIC_API_URL` (Vercel env var).

## CORS

Add the web app's origin to the backend's allowed origins (e.g. your Vercel URL
and `https://securetotalscan.com`) so the browser can call the API.
