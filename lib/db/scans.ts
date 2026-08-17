// ──────────────────────────────────────────────────────────────
// Scan recording.
//
// The first writer to the database. Every scan is recorded, free or paid,
// which is what lets a peer-comparison cohort accrue while Phases 3–4 are
// built (docs/PR-PLAN.md §3.2). Nothing reads these rows yet.
//
// **Recording is best effort and must never break a scan.** The customer's
// result is the product; the row is our bookkeeping. Same rule as `createLead`
// and `postAlert` — and the same discipline as `postAlert`: swallowed, but
// counted and logged, so "we silently stopped recording" is detectable rather
// than discovered when the cohort is mysteriously empty.
// ──────────────────────────────────────────────────────────────

import type { ScanReport } from "@/lib/scanner/types";
import { databaseConfigured, db } from "./client";

/** Failed writes on this instance. Logged with each failure. */
let failureCount = 0;

export function scanWriteFailureCount(): number {
  return failureCount;
}

/** Test seam. */
export function __resetScanWriteFailures(): void {
  failureCount = 0;
}

export type ScanKind = "surface" | "deep";

export interface RecordScanInput {
  report: ScanReport;
  kind: ScanKind;
  /** Null until Phase 3 gives us accounts. */
  customerId?: string | null;
  /**
   * Measured LLM cost in USD **micros** (millionths). A deep scan costs
   * fractions of a cent, so cents would round every scan to zero — see
   * `cost_usd_micros` in migrations/0001_init.sql. Surface scans make no LLM
   * calls and are recorded as 0.
   */
  costUsdMicros?: number;
}

export type RecordScanResult =
  | { recorded: true; id: string }
  | { recorded: false; reason: "not-configured" | "failed" };

/**
 * Record one scan. Never throws.
 *
 * Call it from `after()` in a route handler, not inline — on Vercel an
 * un-awaited promise may never run, because the function can freeze the moment
 * the response is returned.
 */
export async function recordScan(input: RecordScanInput): Promise<RecordScanResult> {
  // Unconfigured is the normal state locally and in CI. Stay quiet — a console
  // line per scan in development is noise, not signal.
  if (!databaseConfigured()) return { recorded: false, reason: "not-configured" };

  const { report, kind, customerId = null, costUsdMicros = 0 } = input;

  let host = "";
  try {
    host = new URL(report.url).hostname.toLowerCase();
  } catch {
    // The report's URL came from `normalizeTarget`, so this should not happen
    // — but a row with an empty host is better than a lost scan, and
    // `target_host` exists so cohort queries need not parse URLs.
    host = "";
  }

  try {
    const sql = db();
    const rows = (await sql`
      INSERT INTO scan (
        customer_id, target_url, target_host, kind,
        grade, score, findings, cost_usd_micros, duration_ms
      ) VALUES (
        ${customerId}, ${report.url}, ${host}, ${kind},
        ${report.grade}, ${report.score}, ${JSON.stringify({
          categories: report.categories,
          summary: report.summary,
          notes: report.notes,
        })}::jsonb, ${costUsdMicros}, ${report.durationMs}
      )
      RETURNING id
    `) as { id: string }[];

    const id = rows[0]?.id;
    if (!id) {
      failureCount += 1;
      console.error(
        `scan record: insert returned no id (${failureCount} failed write(s) on this instance)`,
      );
      return { recorded: false, reason: "failed" };
    }
    return { recorded: true, id };
  } catch (err) {
    failureCount += 1;
    // Counted and logged, never rethrown. A database problem must not turn a
    // successful scan into a 500 for the customer.
    console.error(
      `scan record: write failed (${failureCount} failed write(s) on this instance):`,
      err instanceof Error ? err.message : err,
    );
    return { recorded: false, reason: "failed" };
  }
}
