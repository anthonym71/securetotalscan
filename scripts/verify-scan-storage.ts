import assert from "node:assert/strict";
import * as client from "../lib/db/client";
import { recordSurfaceScan, reportForStorage } from "../lib/db/scans";
import type { ScanReport } from "../lib/scanner/types";

async function main() {
  const report: ScanReport = {
    url: "https://example.test/path?private=value#fragment",
    scannedAt: "2026-09-29T00:00:00Z", durationMs: 120, grade: "B", score: 85,
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    categories: [], notes: ["Redirect https://user:pass@example.test/next?token=private#frag"],
  };
  const stored = reportForStorage(report);
  assert.equal(stored.url, "https://example.test/path");
  assert.equal(stored.notes[0], "Redirect https://example.test/next");
  assert.ok(report.url.includes("?private="), "original response must not be mutated");
  let query = "";
  let params: unknown[] = [];
  Object.assign(client, { db: () => ({ query: async (sql: string, values: unknown[]) => {
    query = sql; params = values;
    return [{ id: "test-scan", created_at: "2026-09-29T00:00:00Z", expires_at: "2027-03-29T00:00:00Z" }];
  } }) });
  const receipt = await recordSurfaceScan(report);
  assert.equal(receipt.id, "test-scan");
  assert.equal(receipt.expiresAt, "2027-03-29T00:00:00.000Z");
  assert.ok(query.includes("INSERT INTO scan"));
  assert.ok(!query.includes("customer_id"), "unverified email must not claim ownership");
  assert.ok(!query.includes("example.test"), "target must be parameterized");
  assert.equal(params[1], "example.test");
  assert.ok(!JSON.stringify(params).includes("private"));
  assert.deepEqual(JSON.parse(String(params[4])), stored);
  Object.assign(client, { db: () => ({ query: async () => [] }) });
  await assert.rejects(recordSurfaceScan(report), /receipt/);
  Object.assign(client, { db: () => ({ query: async () => { throw new Error("storage offline"); } }) });
  await assert.rejects(recordSurfaceScan(report), /storage offline/);
  console.log("Scan storage: parameter binding, privacy, ownership, receipt and failure checks passed");
}
main().catch(() => { console.error("Scan storage verification failed"); process.exitCode = 1; });
