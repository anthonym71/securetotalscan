export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type CategoryId =
  | "database"
  | "secrets"
  | "headers"
  | "cors"
  | "info-disclosure"
  | "dependencies"
  | "debug-artifacts"
  | "input-validation"
  | "auth"
  | "ssl-tls"
  | "exposed-endpoints"
  | "ai-risks";

export interface Finding {
  category: CategoryId;
  severity: Severity;
  title: string;
  /** What we observed on the target. */
  detail: string;
  /** Where we saw it (URL, header name, file path). */
  evidence?: string;
  /** A copy-paste-ready prompt the user can give their AI tool to fix it. */
  fixPrompt: string;
}

export interface CategoryResult {
  id: CategoryId;
  label: string;
  /** True when this category passed with no issues. */
  passed: boolean;
  findings: Finding[];
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface ScanReport {
  url: string;
  scannedAt: string;
  durationMs: number;
  grade: Grade;
  /** 0–100. */
  score: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  categories: CategoryResult[];
  /** Non-fatal notes about what could not be scanned. */
  notes: string[];
}

// ──────────────────────────────────────────────────────────────
// The public half of the report.
//
// `ScanReport` above is the **internal** report. It carries a `fixPrompt` on
// every finding, and it must never be serialised to a browser: the prompts are
// the product. Everything a visitor receives is a `PublicScanReport`, built by
// `toPublicReport()` in ./publicReport.ts.
//
// These are deliberately separate types rather than one type with optional
// fields. If the free response were typed as `ScanReport`, returning the
// internal object would type-check perfectly and leak every prompt — which is
// exactly the state this codebase was in before PR 2.3. Making them distinct
// means the mistake is a compile error rather than a customer discovering our
// paid content in their network tab.
// ──────────────────────────────────────────────────────────────

export interface PublicFinding {
  category: CategoryId;
  severity: Severity;
  title: string;
  detail: string;
  evidence?: string;
  /**
   * Present only where the viewer is entitled to it — for a free visitor that
   * is exactly one sampled finding, so the value on offer is demonstrated
   * rather than described.
   */
  fixPrompt?: string;
  /** True when a prompt exists for this finding and is being withheld. */
  promptLocked: boolean;
}

export interface PublicCategoryResult {
  id: CategoryId;
  label: string;
  passed: boolean;
  findings: PublicFinding[];
}

export interface PublicScanReport {
  /**
   * The recorded `scan.id`. Generated before the response is sent, so the
   * client can ask for premium prompts without waiting on the database write
   * that happens after it. Absent when persistence is not configured.
   */
  scanId?: string;
  url: string;
  scannedAt: string;
  durationMs: number;
  grade: Grade;
  score: number;
  summary: ScanReport["summary"];
  categories: PublicCategoryResult[];
  notes: string[];
  /** What the viewer is entitled to. Drives what the UI offers, not what it hides. */
  entitlement: "free" | "member";
  /** How many prompts are being withheld. Zero for a member. */
  lockedPromptCount: number;
}

/** Shared context passed to every check so each can reuse fetched data. */
export interface ScanContext {
  target: URL;
  /** Final URL after redirects. */
  finalUrl: string;
  status: number;
  /** Lower-cased header name -> value. */
  headers: Record<string, string>;
  html: string;
  /** Absolute URLs of same-origin JS bundles referenced by the page. */
  scriptUrls: string[];
  /** Concatenated contents of fetched JS bundles. */
  bundleSource: string;
  /**
   * Per-bundle sources, so checks can tell application code from framework
   * and vendor chunks. Optional for callers that only have the concatenated
   * blob; those are treated as application code.
   */
  bundles?: { url: string; source: string }[];
  notes: string[];
}
