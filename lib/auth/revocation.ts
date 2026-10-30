import { db, databaseConfigured } from "@/lib/db/client";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * True when a customer session was issued before the customer pressed
 * "Sign out everywhere". Only customer sessions carry `iat` and a database
 * row; owner and access-code sessions are never revoked here.
 *
 * Node runtime only (it queries the database). Middleware stays stateless;
 * the data routes behind it make this check, so a revoked cookie can still
 * load the dashboard shell but every call it makes answers 401 and the page
 * sends the visitor back to /login.
 */
export async function sessionRevoked(session: SessionPayload): Promise<boolean> {
  if (session.role !== "customer" || typeof session.iat !== "number") return false;
  if (!databaseConfigured()) return false;
  const rows = await db().query(
    `SELECT 1
       FROM customer
      WHERE lower(email) = lower($1)
        AND sessions_revoked_at IS NOT NULL
        AND sessions_revoked_at > to_timestamp($2)
      LIMIT 1`,
    [session.email, session.iat],
    { arrayMode: false, fullResults: false },
  );
  return Array.isArray(rows) && rows.length > 0;
}

/** Stamp the watermark: every existing session for this customer is now dead. */
export async function revokeAllSessions(email: string): Promise<void> {
  await db().query(
    `UPDATE customer SET sessions_revoked_at = now(), updated_at = now()
      WHERE lower(email) = lower($1)`,
    [email],
    { arrayMode: false, fullResults: false },
  );
}
