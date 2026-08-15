import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Authenticated server-side proxy to the deep-agent backend.
 *
 * The browser no longer talks to the agent API directly, so the backend URL is
 * a server secret and every deep-agent run is behind the session cookie and an
 * active entitlement.
 */
const AGENT_API_URL =
  process.env.AGENT_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

// Only the endpoints the dashboard actually uses.
const ALLOWED = [
  /^analyze$/,
  /^analyze\/github$/,
  /^analyze\/docker$/,
  /^analyze\/upload$/,
  /^stream\/[\w-]{1,64}$/,
  /^report\/[\w-]{1,64}$/,
  /^evals\/[\w-]{1,64}$/,
];

async function guard(req: NextRequest, path: string) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!ALLOWED.some((pattern) => pattern.test(path))) {
    return NextResponse.json({ error: "Unknown endpoint." }, { status: 404 });
  }
  // Deep runs cost real money downstream — cap them per account and per IP.
  const limits = await Promise.all([
    rateLimit(`agent:email:${session.email}`, 30, 60 * 60),
    rateLimit(`agent:ip:${clientIp(req.headers)}`, 60, 60 * 60),
  ]);
  const blocked = limits.find((limit) => !limit.ok);
  if (blocked) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(blocked.resetIn) } },
    );
  }
  return null;
}

function upstreamUrl(path: string, req: NextRequest): string {
  const base = AGENT_API_URL.replace(/\/$/, "");
  const search = req.nextUrl.search ?? "";
  return `${base}/${path}${search}`;
}

async function forward(
  req: NextRequest,
  path: string,
  init: RequestInit,
): Promise<NextResponse> {
  try {
    const upstream = await fetch(upstreamUrl(path, req), {
      ...init,
      cache: "no-store",
    });
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    headers.set("cache-control", "no-store");
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    }) as NextResponse;
  } catch (err) {
    console.error("agent proxy error:", err);
    return NextResponse.json(
      { error: "The analysis backend is unreachable." },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const path = (await ctx.params).path.join("/");
  const denied = await guard(req, path);
  if (denied) return denied;
  return forward(req, path, { method: "GET", headers: { Accept: "*/*" } });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const path = (await ctx.params).path.join("/");
  const denied = await guard(req, path);
  if (denied) return denied;

  const contentType = req.headers.get("content-type") ?? "";
  const headers: Record<string, string> = { Accept: "*/*" };
  if (contentType) headers["content-type"] = contentType;
  const body = await req.arrayBuffer();
  return forward(req, path, { method: "POST", headers, body });
}
