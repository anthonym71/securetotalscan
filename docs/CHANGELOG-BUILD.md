# Build changelog

Required by PRD v1.2 §0.1.8. Every change gets an entry: date, phase, what
changed in code, what changed in GHL (object + ID), what was verified.
Newest first.

---

## 2026-08-17 — Phase 0 (planning)

**Code:** `docs/PR-PLAN.md` and this changelog added. Plan authored by Claude
Code; repository claims independently re-verified by Viktor before this PR was
opened (PR #97's committed conflict markers, the open-PR count, the `cd.yml`
environment-variable sync trap and the `/dashboard` middleware prefix all
confirmed). No product code, no
configuration and no dependency changes.

**GHL:** No change. No object created, renamed or deleted.

**Infrastructure:** No change. No DNS record touched. No environment variable
set. No deployment triggered.

**Verified against `master` @ `eb00940`:**

- Free `/api/scan` returns the complete `ScanReport`, including every
  `fixPrompt` — the paywall is client-side only today.
- Hero "Get Pro — $49/mo" links directly to the GHL checkout rather than to
  the pricing section.
- `ScanForm` uses `type="url"`, so bare domains are rejected in the browser
  even though the server's `normalizeTarget()` accepts them.
- "Open the agent dashboard →" points at `/dashboard`, which `middleware.ts`
  protects; with `STS_ACCESS_CODES` unset, every visitor is redirected to
  `/login`.
- No HTTP-posture check exists: `checkSsl()` only reports when the target
  itself was requested over `http:`, plus a mixed-content regex.
- No persistence of any kind; runtime dependencies are exactly `next`,
  `react` and `react-dom`.
- Pricing shows three tiers (Free / Pro $49 / Organization); five are required.
- PR #97 is blocked by more than the missing Upstash configuration: it carries
  unresolved merge-conflict markers committed into `docs/ACCESS_CONTROL.md`
  and is based on a stale `master`.
- 20 pull requests are open against `master`: 19 from Dependabot (several of
  them breaking major upgrades) plus PR #97.

**Still missing:** everything in PRD §5. Implementation has not begun and is
awaiting phase-by-phase approval.
