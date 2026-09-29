import type { NextRequest } from "next/server";
import { db } from "../db/client";
import { canReadReport, SCAN_ID } from "./access";
import { clientIp, rateLimit } from "../ratelimit";
import type { ScanReport } from "../scanner/types";

export async function readAuthorizedReport(req: NextRequest, id: string): Promise<
  { report: ScanReport } | { status: number; error: string }
> {
  if (!SCAN_ID.test(id)) return { status: 404, error: "Report not found." };
  if (!canReadReport(id, req.headers.get("authorization"))) {
    return { status: 401, error: "Open the report from your scan results to download it." };
  }
  const limit = await rateLimit(`report:ip:${clientIp(req.headers)}`, 30, 3600);
  if (!limit.available) return { status: 503, error: "Downloads are temporarily unavailable." };
  if (!limit.ok) return { status: 429, error: "Too many downloads. Please try again later." };
  try {
    const rows = await db().query(
      "SELECT findings, expires_at FROM scan WHERE id = $1::uuid LIMIT 1", [id],
      { arrayMode: false, fullResults: false, fetchOptions: { signal: AbortSignal.timeout(5000) } },
    );
    const row = rows[0];
    if (!row) return { status: 404, error: "Report not found." };
    const expiry = Date.parse(row.expires_at);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return { status: 410, error: "This report has expired." };
    const report = row.findings as ScanReport;
    if (!report.url || !Array.isArray(report.categories)) throw new Error("Invalid stored report");
    return { report };
  } catch {
    return { status: 503, error: "Could not load the saved report. Please try again." };
  }
}
