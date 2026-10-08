import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLink, ensureMonthlyCredits } from "@/lib/db/customerAccess";
import { createCustomerSession, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (token.length < 32 || token.length > 256) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));
  }

  const account = await consumeMagicLink(token);
  if (!account) {
    return NextResponse.redirect(new URL("/login?error=expired-link", req.url));
  }

  await ensureMonthlyCredits(account.email, account.tier);
  const session = await createCustomerSession(account.email, account.tier);
  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  res.cookies.set({
    name: SESSION_COOKIE,
    value: session,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  return res;
}
