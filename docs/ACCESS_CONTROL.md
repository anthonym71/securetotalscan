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

Fixed windows, Upstash Redis when configured, in-memory per instance otherwise:

- 5 scans/hour and 20/day per IP
- 10 scans/day per email
- 10 scans/hour per target domain (stops the scanner being used to hammer one site)

## Known remaining gaps

1. **The Railway backend is still reachable directly.** The web app no longer
   exposes its URL, but anyone who knows it can call it. Fix: require a shared
   secret header on the FastAPI side (`X-Agent-Token`) and send it from the
   proxy. Needs a Railway environment change.
2. **CSP still allows `'unsafe-inline'` for scripts**, because Next.js inlines
   its hydration bootstrap on statically pre-rendered pages. Moving to
   nonce-based CSP makes every page dynamic; do it deliberately.
3. **Rate limits are per-instance without Upstash.** Set
   `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` for durable limits.
