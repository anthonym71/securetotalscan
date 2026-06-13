import type { CategoryResult, Finding, Grade, ScanReport } from "./types";

const WEIGHT: Record<Finding["severity"], number> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
  info: 0,
};

export function summarize(categories: CategoryResult[]) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
  for (const cat of categories) {
    for (const f of cat.findings) {
      summary[f.severity] += 1;
      summary.total += 1;
    }
  }
  return summary;
}

export function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Score starts at 100 and is reduced by the weighted sum of findings.
 * Critical issues alone are enough to force a failing grade.
 */
export function computeScore(categories: CategoryResult[]): number {
  let penalty = 0;
  for (const cat of categories) {
    for (const f of cat.findings) {
      penalty += WEIGHT[f.severity];
    }
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function buildReport(
  url: string,
  categories: CategoryResult[],
  durationMs: number,
  notes: string[],
): ScanReport {
  const score = computeScore(categories);
  return {
    url,
    scannedAt: new Date().toISOString(),
    durationMs,
    score,
    grade: scoreToGrade(score),
    summary: summarize(categories),
    categories,
    notes,
  };
}
