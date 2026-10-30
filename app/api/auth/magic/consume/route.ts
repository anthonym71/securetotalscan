import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLink, ensureMonthlyCredits } from "@/lib/db/customerAccess";
import { createCustomerSession, SESSION_COOKIE } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

// A magic link is single-use. Mail providers (Outlook Safe Links, Gmail
// previews, corporate link scanners) routinely GET every URL in an email
// before the recipient sees it — on 2026-10-30 a production link was consumed
// 38 seconds after issue, well before the owner clicked it, and the owner saw
// "expired link". So the GET no longer consumes anything: it renders a small
// confirmation page whose button POSTs the token. Scanners follow GETs, not
// form submissions, and the one use is spent by the human.

function tokenShape(token: string): boolean {
  return token.length >= 32 && token.length <= 256 && /^[A-Za-z0-9_-]+$/.test(token);
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c] as string);
}

function confirmPage(token: string): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in — Secure Total Scan</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0b0f19;color:#fff;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  main{max-width:420px;margin:24px;padding:32px;border:1px solid rgba(255,255,255,.1);
       border-radius:16px;background:rgba(255,255,255,.05)}
  h1{margin:0 0 8px;font-size:22px}
  p{margin:0 0 20px;color:rgba(255,255,255,.6);font-size:14px}
  button{width:100%;padding:12px 20px;border:0;border-radius:12px;font-weight:600;font-size:16px;
         color:#fff;background:linear-gradient(90deg,#6366f1,#8b5cf6);cursor:pointer}
</style>
</head>
<body>
<main>
  <h1>Secure Total Scan</h1>
  <p>Click below to finish signing in. This link works once and expires 20 minutes after it was sent.</p>
  <form method="post" action="/api/auth/magic/consume">
    <input type="hidden" name="token" value="${escapeAttr(token)}">
    <button type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Not `no-referrer`: under that policy browsers submit the form with
      // `Origin: null`, which assertSameOrigin rightly rejects (seen in
      // production on 2026-10-30 as "Forbidden."). same-origin keeps the token
      // out of cross-site referrers while leaving Origin intact for our POST.
      "Referrer-Policy": "same-origin",
    },
  });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!tokenShape(token)) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));
  }
  return confirmPage(token);
}

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  let token = "";
  try {
    const form = await req.formData();
    const value = form.get("token");
    token = typeof value === "string" ? value : "";
  } catch {
    token = "";
  }
  if (!tokenShape(token)) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", req.url), 303);
  }

  const account = await consumeMagicLink(token);
  if (!account) {
    return NextResponse.redirect(new URL("/login?error=expired-link", req.url), 303);
  }

  await ensureMonthlyCredits(account.email, account.tier);
  const session = await createCustomerSession(account.email, account.tier);
  const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
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
