import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./auth/session";
export type Entitlement = "free" | "member";
export const FREE_PROMPT_SAMPLES = 1;
export const SAMPLE_SEVERITY = "medium" as const;
// Existing access codes grant member content, not ownership of saved reports.
// Every saved-report read additionally requires its capability token.
export async function entitlementFor(req: NextRequest): Promise<Entitlement> {
  try {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    return session ? "member" : "free";
  }
  catch { return "free"; }
}
