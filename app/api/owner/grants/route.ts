import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import {
  COMPLIMENTARY_DURATIONS,
  COMPLIMENTARY_TIERS,
  type ComplimentaryDuration,
  type ComplimentaryTier,
  grantComplimentaryAccess,
  listComplimentaryGrants,
  revokeComplimentaryAccess,
} from "@/lib/db/commercial";
import { EMAIL_RE } from "@/lib/leads";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Owner only. A customer session, an access-code session, or no session at
// all gets the same 403 so the route reveals nothing about who exists.
async function ownerFor(req: NextRequest): Promise<{ email: string } | null> {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session || session.role !== "owner") return null;
  return { email: session.email };
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "Owner access required." }, { status: 403, headers: NO_STORE });
}

export async function GET(req: NextRequest) {
  if (!(await ownerFor(req))) return forbidden();
  return NextResponse.json({ grants: await listComplimentaryGrants() }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;
  const owner = await ownerFor(req);
  if (!owner) return forbidden();

  const body = await req.json().catch(() => null) as
    { email?: unknown; tier?: unknown; duration?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers: NO_STORE });
  }
  const tier = body?.tier;
  if (!(COMPLIMENTARY_TIERS as readonly unknown[]).includes(tier)) {
    return NextResponse.json({ error: "Tier must be pro or business." }, { status: 400, headers: NO_STORE });
  }
  const duration = body?.duration;
  if (!(COMPLIMENTARY_DURATIONS as readonly unknown[]).includes(duration)) {
    return NextResponse.json({ error: "Duration must be day, week, month, year or always." }, { status: 400, headers: NO_STORE });
  }

  const grant = await grantComplimentaryAccess({
    email,
    tier: tier as ComplimentaryTier,
    duration: duration as ComplimentaryDuration,
    grantedBy: owner.email,
  });
  return NextResponse.json({ grant }, { status: 201, headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;
  const owner = await ownerFor(req);
  if (!owner) return forbidden();

  const body = await req.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers: NO_STORE });
  }
  const revoked = await revokeComplimentaryAccess(email, owner.email);
  return revoked
    ? NextResponse.json({ revoked: true }, { headers: NO_STORE })
    : NextResponse.json({ error: "No active complimentary access for that email." }, { status: 404, headers: NO_STORE });
}
