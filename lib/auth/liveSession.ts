import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth/session";
import { sessionRevoked } from "@/lib/auth/revocation";

/**
 * verifySession plus the "Sign out everywhere" watermark. Use this in Node
 * route handlers and server pages; middleware keeps the stateless check.
 */
export async function liveSession(req: NextRequest): Promise<SessionPayload | null> {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  if (await sessionRevoked(session)) return null;
  return session;
}
