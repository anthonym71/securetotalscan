import type { SecurityReport } from "./api";

type Finding = Record<string, unknown>;
const identity = (item: Finding) => JSON.stringify([
  item.name ?? item.title, item.file, item.line, item.category, item.severity,
]);

export function additionalVulnerabilities(report: SecurityReport): Finding[] {
  const seen = new Set([...(report.code_findings ?? []), ...(report.docker_findings ?? [])].map(identity));
  return (report.vulnerabilities ?? []).filter((item) => {
    if (seen.has(identity(item))) return false;
    seen.add(identity(item));
    return true;
  });
}

export function highestCandidateSeverity(report: SecurityReport): string {
  const ranks = ["critical", "high", "medium", "low"];
  const findings = [...(report.code_findings ?? []), ...(report.vulnerabilities ?? []),
    ...(report.docker_findings ?? []), ...(report.anomalies ?? [])]
    .filter((item) => item.disposition !== "test_fixture");
  return ranks.find((severity) => findings.some((item) =>
    String(item.severity ?? item.level ?? "").toLowerCase() === severity)) ?? "Not assessed";
}

export function completeSourceCoverage(report: SecurityReport): boolean {
  const c = report.scan_coverage;
  return !!c && c.status === "complete" && c.inventory_complete === true
    && /^[0-9a-f]{40}$/i.test(c.commit_sha ?? "")
    && Number.isInteger(c.inventoried_files) && c.inventoried_files >= 0
    && Number.isInteger(c.eligible_files) && c.eligible_files > 0
    && Array.isArray(c.excluded_files)
    && c.inventoried_files === c.eligible_files + c.excluded_files.length
    && c.scanned_files === c.eligible_files && Array.isArray(c.failed_files) && c.failed_files.length === 0
    && Array.isArray(c.incomplete_reasons) && c.incomplete_reasons.length === 0;
}
