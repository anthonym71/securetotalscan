import { NextRequest, NextResponse } from "next/server";
import { issueMagicLink } from "@/lib/db/customerAccess";
import { sendMagicLinkEmail } from "@/lib/email";
import { EMAIL_RE } from "@/lib/leads";
import { assertSameOrigin } from "@/lib/security/origin";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { limiterUnavailable } from "@/lib/security/limits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const ip = clientIp(req.headers);
  const limit = await rateLimit(`magic:ip:${ip}`, 5, 15 * 60);
  if (!limit.available) return limiterUnavailable();
  if (!limit.ok) return NextResponse.json({ ok: true }, { status: 200 });

  const body = await req.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const issued = await issueMagicLink(email);
  if (issued) {
    const origin = new URL(req.url).origin;
    const url = `${origin}/api/auth/magic/consume?token=${encodeURIComponent(issued.token)}`;
    await sendMagicLinkEmail(email, url);
  }

  // Deliberately identical whether the account exists to prevent enumeration.
  return NextResponse.json({ ok: true }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
