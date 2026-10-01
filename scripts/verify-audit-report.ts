import assert from "node:assert/strict";
import { additionalVulnerabilities, completeSourceCoverage, highestCandidateSeverity } from "../lib/audit-report";
import type { SecurityReport } from "../lib/api";
const finding = {name: "SQL injection", severity: "HIGH", file: "app.py", line: 12, category: "A03"};
const report: SecurityReport = {code_findings: [finding], vulnerabilities: [{...finding, source: "github_code_scan"}, {name: "Header", severity: "MEDIUM"}]};
assert.equal(additionalVulnerabilities(report).length, 1);
assert.equal(additionalVulnerabilities({docker_findings: [finding], vulnerabilities: [finding]}).length, 0);
assert.equal(highestCandidateSeverity(report), "high");
assert.equal(highestCandidateSeverity({code_findings: [{severity: "CRITICAL", disposition: "test_fixture"}]}), "Not assessed");
assert.equal(highestCandidateSeverity({code_findings: [{...finding, verified: true}]}), "high");
assert.equal(completeSourceCoverage({}), false);
const coverage: NonNullable<SecurityReport["scan_coverage"]> = {status: "complete", scope: "supported source", commit_sha: "a".repeat(40), inventory_complete: true, inventoried_files: 100, eligible_files: 100, scanned_files: 100, excluded_files: [], failed_files: [], incomplete_reasons: []};
assert.equal(completeSourceCoverage({scan_coverage: coverage}), true);
for (const change of [{commit_sha: undefined}, {inventoried_files: 120}, {eligible_files: 0, scanned_files: 0, inventoried_files: 0}, {inventory_complete: false}, {scanned_files: 60}, {failed_files: [{path: "app.py", reason: "unreadable"}]}, {incomplete_reasons: ["timeout"]}]) {
 assert.equal(completeSourceCoverage({scan_coverage: {...coverage, ...change}}), false);
}
console.log("Audit report coverage, candidate severity and deduplication checks passed");
