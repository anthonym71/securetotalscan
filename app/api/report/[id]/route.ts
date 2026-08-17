// ──────────────────────────────────────────────────────────────
// Download a recorded scan as a branded PDF.
//
// The report is rebuilt from the stored `scan` row, not by re-scanning. A
// customer downloading the report for the findings in front of them must get
// *those* findings — re-scanning would spend another round of requests against
// their site and could return something different, so the PDF would not match
// the page that offered it.
//
// **Entitlement is applied here, through `toPublicReport`, exactly as
// `/api/scan` applies it.** The PDF is the second way a report leaves the
// server; a paywall that covers only the JSON is not a paywall. Both paths now
// funnel through the same redaction, and `verify:report` searches the generated
// bytes for withheld prompts.
//
// Access control, stated plainly because it is weaker than the word
// "authenticated" suggests: the scan id is an unguessable v4 UUID and holding it
// is what grants access to the report. That is capability-based — anyone with
// the link can fetch it. It cannot be ownership-based yet because there are no
// accounts until PR 3.1; a session today proves someone paid, not *which*
// customer they are, so requiring one would block every free visitor from the
// report that PR 2.5 is meant to email them, while still not proving the report
// was theirs. Entitlement gates the *content*; the capability gates the *file*.
// PR 3.1 replaces this with a real ownership check.
// ──────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { entitlementFor } from "@/lib/entitlements";
import { databaseConfigured, db } from "@/lib/db/client";
import { toPublicReport } from "@/lib/scanner/publicReport";
import { renderReportPdf } from "@/lib/report/reportDoc";
import type { CategoryResult, Grade, ScanReport } from "@/lib/scanner/types";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ScanRow {
  target_url: string;
  target_host: string;
  grade: Grade;
  score: number;
  duration_ms: number;
  created_at: string;
  expires_at: string;
  findings: {
    categories?: CategoryResult[];
    summary?: ScanReport["summary"];
    notes?: string[];
  } | null;
}

/** A filename a person can find again in their downloads folder. */
function filename(host: string, createdAt: string): string {
  const date = (createdAt || "").slice(0, 10) || "scan";
  const safeHost = (host || "report").replace(/[^a-z0-9.-]/gi, "-").slice(0, 60);
  return `secure-total-scan-${safeHost}-${date}.pdf`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json(
      { error: "Report storage is not configured in this environment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let rows: ScanRow[];
  try {
    const sql = db();
    rows = (await sql`
      SELECT target_url, target_host, grade, score, duration_ms,
             created_at, expires_at, findings
      FROM scan
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as ScanRow[];
  } catch (err) {
    console.error("report: read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Could not load that report. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Retention enforced on read as well as by the Phase 4.2 deletion job, so
  // "six months" does not quietly mean "six months, unless our cron was down".
  if (Date.parse(row.expires_at) <= Date.now()) {
    return NextResponse.json(
      { error: "This report has passed its six-month retention period." },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  const stored = row.findings ?? {};
  const internal: ScanReport = {
    url: row.target_url,
    scannedAt: row.created_at,
    durationMs: Number(row.duration_ms) || 0,
    grade: row.grade,
    score: Number(row.score) || 0,
    summary:
      stored.summary ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    categories: stored.categories ?? [],
    notes: stored.notes ?? [],
  };

  const entitlement = await entitlementFor(req);
  const pdf = renderReportPdf(toPublicReport(internal, { entitlement, scanId: id }));

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `attachment; filename="${filename(row.target_host, row.created_at)}"`,
      // The same id renders differently for a member and a free visitor, so a
      // shared cache must never hand one viewer the other's copy.
      "Cache-Control": "private, no-store",
    },
  });
}
