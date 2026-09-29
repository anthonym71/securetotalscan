// Deployment gate: synthetic data only; insert/read/delete are atomic.
// No report survives a successful transaction, and any SQL failure rolls back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db/client";
import { surfaceScanInsert } from "../lib/db/scans";
import type { ScanReport } from "../lib/scanner/types";

async function main() {
  const url = `https://storage-verification.invalid/${randomUUID()}`;
  const report: ScanReport = {
    url, scannedAt: new Date().toISOString(), durationMs: 1, grade: "A", score: 100,
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    categories: [], notes: ["Synthetic deployment verification; not a real scan"],
  };
  const insert = surfaceScanInsert(report);
  const results = await db().transaction(tx => [
    tx.query(insert.text, insert.values),
    tx.query("SELECT id, customer_id, findings, created_at, expires_at FROM scan WHERE target_url = $1", [url]),
    tx.query("DELETE FROM scan WHERE target_url = $1 RETURNING id", [url]),
    tx.query("SELECT id FROM scan WHERE target_url = $1", [url]),
  ], { arrayMode: false, fullResults: false, fetchOptions: { signal: AbortSignal.timeout(15000) } });
  const [inserted, read, deleted, remaining] = results;
  assert.equal(inserted.length, 1);
  assert.equal(read.length, 1);
  assert.equal(deleted.length, 1);
  assert.equal(remaining.length, 0);
  assert.equal(inserted[0].id, read[0].id);
  assert.equal(inserted[0].id, deleted[0].id);
  assert.equal(read[0].customer_id, null);
  assert.deepEqual(read[0].findings, report);
  const retentionDays = (Date.parse(read[0].expires_at) - Date.parse(read[0].created_at)) / 86400000;
  assert.ok(retentionDays >= 181 && retentionDays <= 184);
  console.log("PASS: live database insert, report readback, six-month retention, anonymous ownership and atomic cleanup");
}
main().catch(() => {
  // Never log database error objects: they may contain connection details.
  console.error("FAIL: database storage verification. Check database availability, migration 0001 and runtime permissions.");
  process.exitCode = 1;
});
