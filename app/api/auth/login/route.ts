import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSession,
  isAccessConfigured,
  matchAccessCode,
} from "@/lib/auth/session";
import { EMAIL_RE, createLead } from "@/lib/leads";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { limiterUnavailable } from "@/lib/security/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  if (!isAccessConfigured()) {
    return NextResponse.json(
      { error: "Access is not configured for this deployment." },
      { status: 503 },
    );
  }

  const ip = clientIp(req.headers);
  const attempts = await rateLimit(`login:ip:${ip}`, 10, 15 * 60);
  if (!attempts.available) return limiterUnavailable();
  if (!attempts.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(attempts.resetIn) } },
    );
  }

  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const entitlement = matchAccessCode(code);
  if (!entitlement) {
    return NextResponse.json(
      { error: "That access code isn't valid or has expired." },
      { status: 401 },
    );
  }

  const token = await createSession(email, entitlement.label);
  const res = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  void createLead({ email, tags: ["capture-dashboard-login", `plan-${entitlement.label}`] }).catch(
    () => undefined,
  );

  return res;
}
