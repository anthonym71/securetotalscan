# Deployment — Railway + Vercel

Secure Total Scan uses a split deployment: **Next.js on Vercel** and **FastAPI/LangGraph on Railway**.

## Production URLs

| Service | URL |
|---------|-----|
| Frontend (Vercel) | https://frontend-pearl-five-55.vercel.app |
| Agent dashboard | https://frontend-pearl-five-55.vercel.app/dashboard |
| Backend (Railway) | https://cybersentinel-api-production.up.railway.app |
| RAG health check | https://cybersentinel-api-production.up.railway.app/rag/status |

## Architecture

```
Vercel (Next.js)                    Railway (FastAPI)
─────────────────                   ─────────────────
/              marketing            POST /analyze
/api/scan      surface scanner     POST /analyze/upload
/dashboard     agent UI      ───►  POST /analyze/github
                                    GET  /stream/{id}
                                    GET  /report/{id}
                                    GET  /rag/status
                                    POST /rag/index
```

The frontend calls the backend via `NEXT_PUBLIC_API_URL` (see `lib/api.ts`).

## Vercel (frontend)

**Project:** `frontend` in team `dheerajrvanterus-projects`

### Required environment variable

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://cybersentinel-api-production.up.railway.app` |

Set for **Production** and **Development** (and Preview if using branch previews).

### Deploy

```bash
# From repo root
npx vercel link --project frontend
npx vercel deploy --prod
```

Or connect the GitHub repo in the Vercel dashboard for automatic deploys on push to `master`.

### Notes

- `vercel.json` is frontend-only (`{ "framework": "nextjs" }`). Do not add the Python backend to Vercel — it runs on Railway.
- `NEXT_PUBLIC_*` vars are baked in at build time; redeploy after changing them.

## Railway (backend)

**Project:** `cybersentinel-api`  
**Root directory:** `backend/`  
**Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT` (via `Procfile`)

### Recommended environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Recommended | LLM incident response |
| `GITHUB_TOKEN` | Recommended | GitHub repo scans |
| `NVD_API_KEY` | Optional | CVE lookups |
| `ABUSEIPDB_API_KEY` | Optional | IP reputation |
| `RAG_ENABLED` | Optional | Default `true` |

### Deploy

```bash
cd backend
npx @railway/cli link --project cybersentinel-api
npx @railway/cli up
```

### RAG vector index

The knowledge base is **not** indexed on app startup. Before first deploy (or after editing `backend/data/knowledge/`):

```bash
cd backend
pip install -r requirements.txt
python -m scripts.index_knowledge
git add data/chroma/
```

Or use **Re-index knowledge base** on the `/dashboard` UI.

## Verify after deploy

1. `curl https://cybersentinel-api-production.up.railway.app/rag/status` → `"ready": true`
2. Open https://frontend-pearl-five-55.vercel.app/dashboard
3. Confirm **Knowledge base (RAG)** shows indexed chunks
4. Run **Synthetic logs** → check **Policies** tab for NIST/SOC2 guidance

## Local development

```bash
# Terminal 1 — backend
cd backend && python -m uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install && npm run dev
```
