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

  // Per-IP, not global: each customer gets their own allowance. The window
  // used to answer `{ ok: true }` when exhausted, which hid the limit from the
  // one person it applied to — the owner spent an afternoon on 2026-10-30
  // requesting links that were silently dropped. A 429 reveals nothing about
  // whether an account exists, so it is safe to say so.
  const ip = clientIp(req.headers);
  const limit = await rateLimit(`magic:ip:${ip}`, 10, 15 * 60);
  if (!limit.available) return limiterUnavailable();
  if (!limit.ok) {
    const minutes = Math.max(1, Math.ceil(limit.resetIn / 60));
    return NextResponse.json(
      { error: `Too many sign-in link requests. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(limit.resetIn), "Cache-Control": "no-store" } },
    );
  }

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
