// ──────────────────────────────────────────────────────────────
// Service-to-service authentication for the agent backend.
//
// The Next.js proxy is the only client allowed to call the FastAPI backend.
// It proves that by sending a high-entropy shared secret in a server-only
// header; the backend validates it with a constant-time comparison.
//
// The secret lives exclusively in environment variables (AGENT_SERVICE_TOKEN
// here, STS_SERVICE_TOKEN on the backend) and must never appear in client
// code, logs, error messages or version control.
// ──────────────────────────────────────────────────────────────

/** Header the backend expects. Kept in sync with backend/service_auth.py. */
export const SERVICE_AUTH_HEADER = "x-sts-service-auth";

/** Minimum accepted length, to stop a weak placeholder being used by mistake. */
const MIN_TOKEN_LENGTH = 32;

/**
 * The configured service token, or null when it is missing or too weak.
 * Never log or return this value to a client.
 */
export function serviceToken(): string | null {
  const token = process.env.AGENT_SERVICE_TOKEN?.trim();
  if (!token || token.length < MIN_TOKEN_LENGTH) return null;
  return token;
}

/** True when service-to-service auth is properly configured. */
export function serviceAuthConfigured(): boolean {
  return serviceToken() !== null;
}
