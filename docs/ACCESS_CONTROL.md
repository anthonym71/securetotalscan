# Access control & hardening (operator notes)

## What is protected

| Surface | Before | After |
| --- | --- | --- |
| `/dashboard` (deep agents) | Public | Signed session cookie + active entitlement, else redirect to `/login` |
| Agent backend | Called directly from the browser via `NEXT_PUBLIC_API_URL` | Proxied through `/api/agent/*` behind the same session; backend URL is server-side only (`AGENT_API_URL`) |
| `/api/scan` (free scan) | Open, unlimited | Email required, same-origin only, body-size cap, IP + email + target-domain rate limits |
| `/api/lead` | Open | Same-origin only, 10/hour per IP |
| Response headers | No CSP/XFO/nosniff/Referrer-Policy, wildcard CORS | Full header set on every response, CORS pinned to the site origin |

## Environment variables

Set these in Vercel (Project → Settings → Environment Variables → Production):

- `STS_ACCESS_CODES` — **required to open the dashboard.** Comma-separated,
  each entry `CODE` or `label:CODE`, e.g. `pro:A1B2-C3D4,trial:TRY-2026`.
  While this is unset the dashboard stays closed to everyone (deny by default).
- `STS_AUTH_SECRET` — optional. Dedicated HMAC key for session cookies;
  defaults to a value derived from `STS_ACCESS_CODES`. Changing either signs
  every user out.
- `STS_ACCESS_EXPIRES` — optional ISO date after which all entitlements stop
  working (useful for time-boxed pilots).
- `AGENT_API_URL` — server-side URL of the Railway backend. Falls back to
  `NEXT_PUBLIC_API_URL` if unset, so existing deployments keep working.

Revoking access = remove or change the code in `STS_ACCESS_CODES` and redeploy.

## Rate limits (free scan)

Fixed windows, counted in Upstash Redis:

- 5 scans/hour and 20/day per IP
- 10 scans/day per email
- 10 scans/hour per target domain (stops the scanner being used to hammer one site)

`/api/lead` (10/hour per IP), `/api/auth/login` (10 per 15 min per IP) and the
deep-agent proxy (30/hour per account, 60/hour per IP) use the same limiter.

**Production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.**
Serverless instances do not share memory, so a per-instance counter is bypassed
by simply sending concurrent requests. If the durable store is missing or
unreachable in production, the limiter retries once and then reports
`available: false`, and every rate-limited route answers `503` with
`Retry-After` — it never serves the endpoint unmetered. Development and preview
deployments still fall back to an in-memory window.

## Service-to-service authentication (proxy → backend)

The FastAPI backend only serves callers that present a shared secret in the
`X-STS-Service-Auth` header, validated with a constant-time comparison
(`backend/service_auth.py`). The Next.js proxy attaches it server-side
(`lib/security/serviceAuth.ts`); it never reaches the browser.

- Web app (Vercel): `AGENT_SERVICE_TOKEN`
- Backend (Railway): `STS_SERVICE_TOKEN`
- Both must hold the **same** 32+ character value. Generate one with
  `openssl rand -hex 32`. Keep it in environment variables only — never in
  code, logs, PR text, chat or git history.
- **Fail closed.** Missing or too-short secret: the proxy returns 503 without
  calling the backend, and the backend returns 503 for every protected path.
  A wrong secret returns 401.
- Exempt from the check: `/health/trivy`, `/health` and `/` so the platform
  health check still works during deploys.
- Rotation: set the new value on both sides (backend first, then the web app),
  then redeploy. In-flight deep runs will fail and can be retried.

## Known remaining gaps

1. **CSP still allows `'unsafe-inline'` for scripts**, because Next.js inlines
   its hydration bootstrap on statically pre-rendered pages. Moving to
   nonce-based CSP makes every page dynamic; do it deliberately.
2. **Rate limits are per-instance without Upstash.** Set
   `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` for durable limits.
