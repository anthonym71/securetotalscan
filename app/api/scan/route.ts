import { NextRequest, NextResponse } from "next/server";
import { ScanError, normalizeTarget, scan } from "@/lib/scanner";
import { EMAIL_RE, createLead } from "@/lib/leads";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Free-tier quotas. Tuned so a genuine visitor never notices, while the
// endpoint cannot be used as a free scanning service or a traffic amplifier.
const LIMITS = {
  ipPerHour: { max: 5, window: 60 * 60 },
  ipPerDay: { max: 20, window: 60 * 60 * 24 },
  emailPerDay: { max: 10, window: 60 * 60 * 24 },
  targetPerHour: { max: 10, window: 60 * 60 }, // per scanned domain, all users
} as const;

const MAX_BODY_BYTES = 4096;

function tooMany(resetIn: number) {
  return NextResponse.json(
    {
      error:
        "You've hit the free scan limit. Try again later, or get in touch for a full deep scan.",
    },
    {
      status: 429,
      headers: { "Retry-After": String(resetIn), "Cache-Control": "no-store" },
    },
  );
}

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large." }, { status: 413 });
  }

  let body: { url?: string; email?: string };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address to run the free scan." },
      { status: 400 },
    );
  }

  // Validate the target before spending any quota on it.
  let target: URL;
  try {
    target = normalizeTarget(url);
  } catch (err) {
    if (err instanceof ScanError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 422 });
  }

  const ip = clientIp(req.headers);
  const domain = target.hostname.toLowerCase();

  const checks = await Promise.all([
    rateLimit(`scan:ip:h:${ip}`, LIMITS.ipPerHour.max, LIMITS.ipPerHour.window),
    rateLimit(`scan:ip:d:${ip}`, LIMITS.ipPerDay.max, LIMITS.ipPerDay.window),
    rateLimit(`scan:email:d:${email}`, LIMITS.emailPerDay.max, LIMITS.emailPerDay.window),
    rateLimit(`scan:target:h:${domain}`, LIMITS.targetPerHour.max, LIMITS.targetPerHour.window),
  ]);
  const blocked = checks.find((check) => !check.ok);
  if (blocked) return tooMany(blocked.resetIn);

  try {
    const report = await scan(target.toString());

    // Lead capture is best effort: never fail or delay the scan because the
    // CRM is slow or unconfigured.
    void createLead({
      email,
      url: target.toString(),
      grade: report.grade,
      score: report.score,
      tags: ["capture-free-scan"],
    }).catch(() => undefined);

    return NextResponse.json(report, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ScanError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("scan failed:", err);
    return NextResponse.json(
      { error: "The scan failed unexpectedly. Please try again." },
      { status: 500 },
    );
  }
}
