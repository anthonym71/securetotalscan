import { readJsonObject, RequestBodyError, requireStringFields } from "@/lib/security/requestBody";
import { NextRequest, NextResponse } from "next/server";
import { EMAIL_RE, createLead } from "@/lib/leads";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { limiterUnavailable } from "@/lib/security/limits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const ip = clientIp(req.headers);
  const ipLimit = await rateLimit(`lead:ip:${ip}`, 10, 60 * 60);
  if (!ipLimit.available) return limiterUnavailable();
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(ipLimit.resetIn) } },
    );
  }

  let body: { email?: string; url?: string; grade?: string; score?: number };
  try {
    const parsed = await readJsonObject(req);
    requireStringFields(parsed, ["email", "url", "grade"]);
    body = parsed;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyError ? error.message : "Invalid JSON body." },
      { status: error instanceof RequestBodyError ? error.status : 400 },
    );
  }

  const email = (body.email ?? "").trim();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 },
    );
  }

  const result = await createLead({
    email,
    url: body.url,
    grade: body.grade,
    score: typeof body.score === "number" ? body.score : undefined,
    tags: ["capture-report-request"],
  });

  if (result.ok) {
    return NextResponse.json(
      { ok: true, duplicate: result.duplicate ?? false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}
