// ──────────────────────────────────────────────────────────────
// Minimal, dependency-free access control for the agent dashboard.
//
// Model: an *entitlement* is proving you hold a valid access code.
// Codes live in the STS_ACCESS_CODES env var (comma-separated). A
// successful login mints a signed, HttpOnly session cookie.
//
// Deny by default: if STS_ACCESS_CODES is unset, nobody gets in.
// No third-party auth provider, no database, nothing to pay for, and
// reverting the deploy restores the previous behaviour exactly.
//
// Edge-safe: uses Web Crypto only, so middleware can verify sessions.
// ──────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "sts_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  /** Email captured at login (audit trail / lead record). */
  email: string;
  /** Label of the access code used, never the code itself. */
  plan: string;
  /** Unix seconds. */
  exp: number;
}

/** Parsed access codes. Format: `CODE` or `label:CODE`. */
export function accessCodes(): { label: string; code: string }[] {
  const raw = process.env.STS_ACCESS_CODES ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx === -1) return { label: "pro", code: entry };
      return {
        label: entry.slice(0, idx).trim() || "pro",
        code: entry.slice(idx + 1).trim(),
      };
    })
    .filter((entry) => entry.code.length > 0);
}

/** True when access control has been configured for this deployment. */
export function isAccessConfigured(): boolean {
  return accessCodes().length > 0;
}

/**
 * Optional hard expiry for all entitlements, e.g. STS_ACCESS_EXPIRES=2027-01-01.
 * Returns null when unset or unparseable.
 */
function entitlementDeadline(): number | null {
  const raw = process.env.STS_ACCESS_EXPIRES;
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isNaN(ts) ? null : Math.floor(ts / 1000);
}

function signingKeyMaterial(): string {
  // A dedicated secret is preferred; otherwise derive from the code list so
  // there is exactly one env var to configure. Rotating either invalidates
  // every existing session, which is the desired behaviour.
  return (
    process.env.STS_AUTH_SECRET ??
    `derived:${process.env.STS_ACCESS_CODES ?? ""}`
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKeyMaterial()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return base64UrlEncode(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a submitted access code (constant-time over the configured list). */
export function matchAccessCode(submitted: string): { label: string } | null {
  const candidate = submitted.trim();
  if (!candidate) return null;
  let match: { label: string } | null = null;
  for (const entry of accessCodes()) {
    if (timingSafeEqual(entry.code, candidate)) match = { label: entry.label };
  }
  return match;
}

export async function createSession(
  email: string,
  plan: string,
): Promise<string> {
  const deadline = entitlementDeadline();
  let exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  if (deadline !== null) exp = Math.min(exp, deadline);
  const payload: SessionPayload = { email, plan, exp };
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return `${body}.${await hmac(body)}`;
}

export async function verifySession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token || !isAccessConfigured()) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!timingSafeEqual(await hmac(body), sig)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  } catch {
    return null;
  }
  if (typeof payload?.exp !== "number") return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  const deadline = entitlementDeadline();
  if (deadline !== null && deadline <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}
