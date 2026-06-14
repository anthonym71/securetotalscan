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
| `GIT_TOKEN` | Higher GitHub API rate limits for repo scans |
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

## Deploy (Railway + Nixpacks)

This backend ships with **`nixpacks.toml`** and **`railway.toml`** for Railway. Trivy is installed during the build phase.

### 1. Create a backend service

1. In Railway, add a **new service** from this GitHub repo.
2. **Settings → Root Directory** → `backend`
3. **Settings → Config-as-code** → Config file path: `/backend/railway.toml`  
   (Required for monorepos — Railway does not auto-discover config inside subfolders.)
4. **Variables** — add at minimum:
   - `OPENROUTER_API_KEY`
   - `GIT_TOKEN` (optional)
5. Deploy.

Railway uses **Railpack** (Nixpacks successor). It reads `nixpacks.toml`, installs Python from `requirements.txt`, runs `install-trivy.sh`, then starts uvicorn.

### 2. Verify Trivy

```bash
curl https://YOUR-SERVICE.up.railway.app/health/trivy
```

Expect `"available": true` and `"db_ready": true`.

### 3. Alternative: Docker

If you prefer Docker over Nixpacks, rename `Dockerfile.trivy` → `Dockerfile` and set `builder = "DOCKERFILE"` in `railway.toml`.  
**Do not keep both** — Railway always prefers `Dockerfile` when it exists.

### 4. Web app

Copy the Railway HTTPS URL into Vercel as `NEXT_PUBLIC_API_URL`.

**Note:** `Procfile` alone only starts uvicorn — it does **not** install Trivy. Use Nixpacks or Docker.

## CORS

Add the web app's origin to the backend's allowed origins (e.g. your Vercel URL
and `https://securetotalscan.com`) so the browser can call the API.
