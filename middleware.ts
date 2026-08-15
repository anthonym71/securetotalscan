import { NextRequest, NextResponse } from "next/server";
import { SECURITY_HEADERS } from "@/lib/security/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

// Paths that require an authenticated session with an active entitlement.
const PROTECTED_PREFIXES = ["/dashboard", "/api/agent"];

function withSecurityHeaders(res: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(name, value);
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected) {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(
          NextResponse.json(
            { error: "Authentication required." },
            { status: 401 },
          ),
        );
      }
      const login = req.nextUrl.clone();
      login.pathname = "/login";
      login.search = `?next=${encodeURIComponent(pathname)}`;
      return withSecurityHeaders(NextResponse.redirect(login));
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  // Everything except Next's build output and the image optimiser; those are
  // covered by the static header mirror in next.config.mjs.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
