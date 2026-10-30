import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { describeSession } from "@/lib/auth/roleLabel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who am I signed in as? Reads the signed session cookie server-side only. */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json(describeSession(session), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
