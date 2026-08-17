// ──────────────────────────────────────────────────────────────
// Turning a backend finding into something a person can read.
//
// The deep-analysis agents each emit their own dict shape and there is no
// shared schema, so the dashboard has to derive a label from whichever keys
// happen to be present. That is fine — until a shape turns up whose keys are
// not in the chain, at which point the UI silently renders raw JSON at the
// customer.
//
// That is exactly what happened: the chain checked `message`, `description`,
// `title` and `type`, and three of the seven real shapes carry none of them.
// The data was correct the whole time; only the display was wrong.
//
// Extracted from the component so the mapping can be tested against every
// real shape rather than checked by eye once — this surface is what the $19
// and $49 tiers sell, and the Phase 1 preview dashboard mirrors it.
// ──────────────────────────────────────────────────────────────

export type Finding = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * The human-readable headline for a finding.
 *
 * Order matters. `description` stays ahead of `name` because a Trivy CVE
 * carries the identifier in `name` and the readable summary in `description`
 * — "Out-of-bounds write in zlib" beats "CVE-2023-45853" as a headline, and
 * the identifier is still surfaced by `findingMeta()`.
 *
 * Returns an empty string only when the finding carries no usable text at
 * all; callers decide what to do about that.
 */
export function findingLabel(item: Finding): string {
  const direct =
    text(item.message) ||
    text(item.description) ||
    text(item.title) ||
    // Added: code findings ({category, name, severity, recommendation, file,
    // line, …}) and OWASP vulnerabilities ({category, name, severity,
    // recommendation, linked_anomaly}) carry their headline here and nowhere
    // else. Both rendered as raw JSON before this line existed.
    text(item.name);
  if (direct) return direct;

  // Missing-header findings are {header, severity, recommendation,
  // fix_prompt} — no label key at all, so one is composed from what is there.
  const header = text(item.header);
  if (header) return `Missing ${header} response header`;

  // Log anomalies are typed rather than described: "brute_force".
  const type = text(item.type);
  if (type) return type.replace(/_/g, " ");

  // Compliance gaps always carry a description, so this is a genuine
  // last resort rather than a routine path.
  const control = text(item.control_id);
  if (control) return `${text(item.framework) || "Control"} ${control}`;

  return "";
}

/**
 * The remediation line shown under the label.
 *
 * Present on every code finding, OWASP vulnerability and missing-header
 * finding, and never displayed before this change — the agents were writing
 * advice the customer could not see.
 */
export function findingRecommendation(item: Finding): string {
  const recommendation = text(item.recommendation);
  // Suppress it when it is the label, which happens on shapes whose only
  // text is the advice itself.
  return recommendation && recommendation !== findingLabel(item) ? recommendation : "";
}

/** Where the finding is, e.g. `src/db.ts:42`. */
export function findingLocation(item: Finding): string {
  const where = text(item.file) || text(item.path) || text(item.location);
  if (!where) return "";
  const line = typeof item.line === "number" ? item.line : Number(text(item.line));
  return Number.isFinite(line) && line > 0 ? `${where}:${line}` : where;
}

/**
 * Short identifier shown alongside the label — a CVE id, an OWASP category,
 * or the anomaly a vulnerability was derived from.
 *
 * Skipped when it is already the label, so a code finding does not print its
 * own name twice.
 */
export function findingMeta(item: Finding): string {
  const label = findingLabel(item);
  const candidates = [text(item.name), text(item.category), text(item.control_id)];
  const meta = candidates.find((value) => value && value !== label);
  return meta ?? "";
}

/**
 * True when nothing readable could be derived. The caller falls back to
 * showing the raw object — visibly wrong, but better than an empty row, and
 * a signal that a new agent shape needs adding to `findingLabel`.
 */
export function isUnreadable(item: Finding): boolean {
  return findingLabel(item) === "";
}
