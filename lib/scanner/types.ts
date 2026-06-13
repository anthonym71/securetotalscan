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
  notes: string[];
}
