import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { revokeAllSessions } from "@/lib/auth/revocation";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST {} clears this browser's cookie. POST { everywhere: true } also stamps
 * the customer's revocation watermark so every other browser's session dies
 * on its next request. Owner sessions are revoked by rotating the owner
 * credentials, not here.
 */
export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const body = await req.json().catch(() => null) as { everywhere?: unknown } | null;
  let everywhere = false;
  if (body?.everywhere === true) {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (session?.role === "customer") {
      await revokeAllSessions(session.email);
      everywhere = true;
    }
  }

  const res = NextResponse.json({ ok: true, everywhere }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
