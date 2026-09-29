import { db } from "./client";
import type { ScanReport } from "../scanner/types";

export interface ScanReceipt {
  id: string;
  createdAt: string;
  expiresAt: string;
}

// Persist the report, never fetched HTML, bundles, logs, or the submitted email.
// A typed email is not proof of account ownership: anonymous scans remain
// unassigned until a verified account/claim flow exists.
export function reportForStorage(report: ScanReport): ScanReport {
  const cleanUrl = (value: string) => value.replace(/https?:\/\/[^\s"<>]+/gi, (match) => {
    try {
      const url = new URL(match);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch { return "[invalid URL]"; }
  });
  // Apply to evidence and notes as well as the target, since probes may quote
  // redirect URLs. Do not mutate the in-memory response.
  return JSON.parse(JSON.stringify(report, (_key, value) =>
    typeof value === "string" ? cleanUrl(value) : value,
  )) as ScanReport;
}

export function surfaceScanInsert(report: ScanReport) {
  const stored = reportForStorage(report);
  return {
    text: `INSERT INTO scan
      (target_url, target_host, kind, grade, score, findings, duration_ms)
     VALUES ($1, $2, 'surface', $3, $4, $5::jsonb, $6)
     RETURNING id, created_at, expires_at`,
    values: [stored.url, new URL(stored.url).hostname.toLowerCase(), stored.grade,
      stored.score, JSON.stringify(stored), stored.durationMs],
  };
}

export async function recordSurfaceScan(report: ScanReport): Promise<ScanReceipt> {
  const insert = surfaceScanInsert(report);
  const rows = await db().query(
    insert.text, insert.values,
    { arrayMode: false, fullResults: false, fetchOptions: { signal: AbortSignal.timeout(5000) } },
  );
  if (!Array.isArray(rows) || rows.length !== 1 || Array.isArray(rows[0])) {
    throw new Error("Scan storage did not return a receipt");
  }
  return {
    id: String(rows[0].id),
    createdAt: new Date(rows[0].created_at).toISOString(),
    expiresAt: new Date(rows[0].expires_at).toISOString(),
  };
}
