import { NextRequest, NextResponse, after } from "next/server";
import { ScanError, normalizeTarget, scan } from "@/lib/scanner";
import { EMAIL_RE, createLead } from "@/lib/leads";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { anyUnavailable, limiterUnavailable } from "@/lib/security/limits";
import { customerRef, postAlert } from "@/lib/alerting";
import { recordScan } from "@/lib/db/scans";
import { databaseConfigured } from "@/lib/db/client";
import { entitlementFor } from "@/lib/entitlements";
import { toPublicReport } from "@/lib/scanner/publicReport";
import { randomUUID } from "node:crypto";

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
  // No trustworthy counter (no durable store, or it is unreachable) → refuse.
  if (anyUnavailable(checks)) {
    // Critical: this is not one visitor being unlucky. While the durable store
    // is unreachable, every rate-limited route refuses, so the free scanner is
    // down for everyone. The dedupe key carries no request detail, so a flood
    // of 503s collapses into one page.
    after(() =>
      postAlert({
        severity: "critical",
        kind: "ratelimit-store-unavailable",
        detail:
          "Durable rate-limit store unreachable in production; /api/scan is refusing all requests with 503.",
        dedupeKey: "ratelimit-store-unavailable",
      }),
    );
    return limiterUnavailable();
  }

  const blocked = checks.find((check) => !check.ok);
  if (blocked) return tooMany(blocked.resetIn);

  const entitlement = await entitlementFor(req);

  try {
    const report = await scan(target.toString());

    // Minted here, not by the database, because the response must carry it and
    // the row is written in `after()` — i.e. after this response is gone.
    const scanId = databaseConfigured() ? randomUUID() : undefined;

    // Lead capture and scan recording are both best effort: neither may fail
    // or delay the scan because the CRM or the database is slow, and both are
    // normal no-ops when unconfigured.
    //
    // Both run inside `after()`. On Vercel an un-awaited promise may never run
    // at all — the function can freeze the instant the response is returned —
    // so `void promise` is not "fire and forget", it is "fire and possibly
    // nothing". They run concurrently because neither depends on the other.
    after(() =>
      Promise.all([
        createLead({
          email,
          url: target.toString(),
          grade: report.grade,
          score: report.score,
          tags: ["capture-free-scan"],
        }).catch(() => undefined),
        // The free scan is a surface scan and makes no LLM calls, so its
        // measured cost is zero rather than unknown.
        recordScan({ id: scanId, report, kind: "surface", costUsdMicros: 0 }),
      ]),
    );

    // `toPublicReport` and never `report`. The internal report carries a fix
    // prompt on every finding, and those prompts are the product — this is the
    // single line that decides whether they are sold or given away.
    // `verify:paywall` asserts this route serialises nothing else.
    return NextResponse.json(toPublicReport(report, { entitlement, scanId }), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ScanError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("scan failed:", err);

    // Warning, not critical: one scan failing is usually the target, not us.
    // The error class is part of the dedupe key so a new failure mode is a new
    // alert rather than being suppressed behind an unrelated one. "The scanner
    // is down for everyone" is caught by the scheduled health check
    // (.github/workflows/health-check.yml), which does not depend on this
    // process being alive — the case that hid the two-month Railway outage.
    const errorClass = err instanceof Error ? err.constructor.name : "UnknownError";
    after(() =>
      postAlert({
        severity: "warning",
        kind: "scan-unhandled-error",
        site: domain,
        customer: customerRef(email),
        detail: `Free scan raised ${errorClass} and returned 500.`,
        dedupeKey: `scan-unhandled-error:${errorClass}`,
      }),
    );

    return NextResponse.json(
      { error: "The scan failed unexpectedly. Please try again." },
      { status: 500 },
    );
  }
}
