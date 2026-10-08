import { readJsonObject, RequestBodyError, requireStringFields } from "@/lib/security/requestBody";
import { NextRequest, NextResponse, after } from "next/server";
import { ScanError, normalizeTarget, scan } from "@/lib/scanner";
import { EMAIL_RE, createLead } from "@/lib/leads";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { anyUnavailable, limiterUnavailable } from "@/lib/security/limits";
import { customerRef, postAlert } from "@/lib/alerting";
import { recordSurfaceScan } from "@/lib/db/scans";
import { recordCustomerSurfaceScan } from "@/lib/db/sites";
import { reportAccessToken } from "@/lib/report/access";
import { entitlementFor } from "@/lib/entitlements";
import { toPublicReport } from "@/lib/scanner/publicReport";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { sendReportEmail } from "@/lib/email";

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

  let body: { url?: string; email?: string };
  try {
    const parsed = await readJsonObject(req);
    requireStringFields(parsed, ["url", "email"]);
    body = parsed;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyError ? error.message : "Invalid JSON body." },
      { status: error instanceof RequestBodyError ? error.status : 400 },
    );
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

  try {
    const report = await scan(target.toString());
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
    const verifiedCustomer =
      session?.role === "customer" && session.email.toLowerCase() === email
        ? session
        : null;

    // A verified paid customer owns their scan. Anonymous/free visitors remain
    // deliberately unassigned because a typed email address is not ownership proof.
    try {
      const receipt = verifiedCustomer
        ? await recordCustomerSurfaceScan(verifiedCustomer.email, report)
        : await recordSurfaceScan(report);
      report.storage = { status: "saved", ...receipt };
    } catch {
      report.storage = { status: "unavailable" };
      report.notes.push("This result could not be saved. Copy the findings before closing this page.");
      after(() => postAlert({
        severity: "warning",
        kind: "scan-storage-unavailable",
        detail: "A surface scan completed but its database write failed.",
        dedupeKey: "scan-storage-unavailable",
      }));
    }

    // Lead capture is best effort: never fail or delay the scan because the
    // CRM is slow or unconfigured.
    void createLead({
      email,
      url: target.toString(),
      grade: report.grade,
      score: report.score,
      tags: ["capture-free-scan"],
    }).catch(() => undefined);

    const entitlement = await entitlementFor(req);
    const publicReport = toPublicReport(report, { entitlement });
    if (report.storage?.status === "saved") {
      const receipt = report.storage;
      const readToken = reportAccessToken(receipt.id);
      publicReport.storage = { ...receipt, ...(readToken ? { readToken } : {}) };

      // Email only to a cryptographically verified customer session, never to
      // an arbitrary address typed into the public free-scan form.
      if (verifiedCustomer && entitlement === "member") {
        after(async () => {
          const delivered = await sendReportEmail(
            verifiedCustomer.email,
            toPublicReport(report, { entitlement: "member", scanId: receipt.id }),
            receipt.id,
          );
          if (!delivered.delivered) {
            await postAlert({
              severity: "warning",
              kind: "paid-report-email-failed",
              customer: customerRef(verifiedCustomer.email),
              detail: `Paid surface scan ${receipt.id} completed but report email was not delivered (${delivered.reason ?? "unknown"}).`,
              dedupeKey: `paid-report-email-failed:${delivered.reason ?? "unknown"}`,
            });
          }
        });
      }
    } else {
      publicReport.storage = { status: "unavailable" };
    }
    return NextResponse.json(publicReport, {
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
