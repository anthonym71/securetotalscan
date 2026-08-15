import { NextRequest, NextResponse } from "next/server";

/**
 * Reject cross-site use of our JSON endpoints.
 *
 * Browsers always send `Origin` on cross-origin POSTs, so an Origin that does
 * not match this deployment's host is a third-party site (or a scripted abuse
 * client) using our API. A missing Origin (curl, server-to-server) is allowed
 * through and still hits the rate limits.
 */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const allowed = new Set<string>();
  const host = req.headers.get("host");
  if (host) allowed.add(host);
  allowed.add("securetotalscan.com");
  allowed.add("www.securetotalscan.com");
  const configured = process.env.NEXT_PUBLIC_SITE_HOST;
  if (configured) allowed.add(configured);

  // Vercel preview deployments of this project.
  if (/\.vercel\.app$/.test(originHost) && process.env.VERCEL_ENV !== "production") {
    return null;
  }

  if (allowed.has(originHost)) return null;
  return NextResponse.json(
    { error: "Cross-origin requests are not allowed." },
    { status: 403 },
  );
}
