import { NextRequest, NextResponse } from "next/server";
import { liveSession } from "@/lib/auth/liveSession";
import { describeSession } from "@/lib/auth/roleLabel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who am I signed in as? Reads the signed session cookie server-side only. */
export async function GET(req: NextRequest) {
  const session = await liveSession(req);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json(describeSession(session), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
