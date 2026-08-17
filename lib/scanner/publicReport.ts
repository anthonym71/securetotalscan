// ──────────────────────────────────────────────────────────────
// Turning an internal ScanReport into what a visitor is allowed to see.
//
// This is the paywall. Everything else — the UI lock icon, the upgrade CTA, the
// pricing page — is decoration on top of this function. If this function is
// wrong, none of the rest matters, because the payload is already in the
// browser by the time any of it renders.
//
// **The one rule that makes this safe: build the public object by naming every
// field, never by copying and removing.**
//
//     // Wrong, and it works today:
//     const pub = { ...finding };  delete pub.fixPrompt;
//
//     // Right:
//     const pub = { category: f.category, severity: f.severity, ... };
//
// The wrong version passes every test that exists at the moment it is written.
// It fails silently the day someone adds a field to `Finding` — a
// `remediationSteps`, an `exploitPath`, an internal confidence score — because
// spread copies fields nobody listed. An allowlist excludes anything new by
// default, so the failure mode of forgetting to update this file is a *missing*
// field in the UI, which someone notices, rather than a *leaked* one, which
// nobody does.
//
// `scripts/verify-paywall.ts` asserts exactly this by adding an unknown field
// to a finding at runtime and checking it does not appear in the output.
// ──────────────────────────────────────────────────────────────

import type { Entitlement } from "../entitlements";
import { FREE_PROMPT_SAMPLES, SAMPLE_SEVERITY } from "../entitlements";
import type {
  Finding,
  PublicCategoryResult,
  PublicFinding,
  PublicScanReport,
  ScanReport,
} from "./types";

/**
 * Choose which findings a free visitor sees a prompt for.
 *
 * Returns a Set of identities (the finding objects themselves), so the decision
 * is made once over the whole report rather than per category — a per-category
 * "first medium" would hand out one sample per category, which is every prompt
 * on a report with enough categories.
 *
 * Deterministic: the same report always samples the same finding. A sample that
 * moved between two requests for the same scan would look like a bug to the
 * visitor and would make the verification script flaky.
 */
function sampledFindings(report: ScanReport): Set<Finding> {
  const candidates = report.categories
    .flatMap((category) => category.findings)
    .filter((finding) => finding.severity === SAMPLE_SEVERITY);

  return new Set(candidates.slice(0, FREE_PROMPT_SAMPLES));
}

function toPublicFinding(finding: Finding, showPrompt: boolean): PublicFinding {
  const hasPrompt = Boolean(finding.fixPrompt);

  const output: PublicFinding = {
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    detail: finding.detail,
    // Locked when a prompt exists and is not being shown. A finding with no
    // prompt at all is not "locked" — telling someone content is withheld when
    // there is none to withhold is a lie in the direction of looking valuable.
    promptLocked: hasPrompt && !showPrompt,
  };

  // Assigned conditionally rather than as `evidence: finding.evidence`, so the
  // key is absent from the JSON rather than present as null.
  if (finding.evidence) output.evidence = finding.evidence;
  if (showPrompt && finding.fixPrompt) output.fixPrompt = finding.fixPrompt;

  return output;
}

export interface PublicReportOptions {
  entitlement: Entitlement;
  /** The `scan.id` this report was recorded under, when persistence is on. */
  scanId?: string;
}

/**
 * The only function permitted to produce something sent to a browser.
 *
 * A member receives every prompt. A free visitor receives exactly one sampled
 * medium-severity prompt and a count of what is withheld.
 */
export function toPublicReport(
  report: ScanReport,
  options: PublicReportOptions,
): PublicScanReport {
  // Two independent questions, kept separate on purpose. "Is this viewer
  // entitled to everything?" and "which one finding is the free sample?" were
  // originally folded into one Set, where an empty set meant *both* "no
  // restriction" and "no samples" — so a member received nothing. Written this
  // way the entitlement decision is visible on its own line.
  const unrestricted = options.entitlement !== "free";
  const sampled = unrestricted ? new Set<Finding>() : sampledFindings(report);

  let lockedPromptCount = 0;

  const categories: PublicCategoryResult[] = report.categories.map((category) => {
    const findings = category.findings.map((finding) => {
      const publicFinding = toPublicFinding(finding, unrestricted || sampled.has(finding));
      if (publicFinding.promptLocked) lockedPromptCount += 1;
      return publicFinding;
    });

    return {
      id: category.id,
      label: category.label,
      passed: category.passed,
      findings,
    };
  });

  const output: PublicScanReport = {
    url: report.url,
    scannedAt: report.scannedAt,
    durationMs: report.durationMs,
    grade: report.grade,
    score: report.score,
    summary: {
      critical: report.summary.critical,
      high: report.summary.high,
      medium: report.summary.medium,
      low: report.summary.low,
      info: report.summary.info,
      total: report.summary.total,
    },
    categories,
    notes: report.notes,
    entitlement: options.entitlement,
    lockedPromptCount,
  };

  if (options.scanId) output.scanId = options.scanId;

  return output;
}
