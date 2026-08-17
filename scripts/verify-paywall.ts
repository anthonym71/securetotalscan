// Offline regression tests for the server-side paywall.
//
// The premise of PR 2.3: before it, `/api/scan` returned the complete internal
// report to anybody who asked, so every "premium" fix prompt was already in the
// browser of every free visitor. No amount of UI could fix that — the payload
// had already arrived.
//
// So these checks are written against the **serialised payload**, not against
// the component tree. What a page chooses to render is a display decision; what
// the server chose to send is the security boundary. Anything present in the
// JSON is public, whether or not a component draws it.
//
// Five rules:
//
//   1. A free visitor receives exactly one fix prompt, and it is the sampled
//      medium-severity one.
//   2. No withheld prompt appears anywhere in the free payload — asserted by
//      substring search over the serialised JSON, which is what an attacker
//      actually reads.
//   3. Redaction is an allowlist. A field added to `Finding` tomorrow must not
//      appear in the public output without someone choosing to add it.
//   4. Entitlement fails closed. Anything that is not a verified member is
//      free, including every error path.
//   5. The premium route checks entitlement before it touches the database.
//
// Run: npm run verify:paywall

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FREE_PROMPT_SAMPLES, SAMPLE_SEVERITY } from "../lib/entitlements";
import { toPublicReport } from "../lib/scanner/publicReport";
import type { Finding, ScanReport } from "../lib/scanner/types";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const root = join(__dirname, "..", "..");

function source(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

/** Source with comments stripped and whitespace flattened, as in verify-claims. */
function rendered(relative: string): string {
  return source(relative)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\s+/g, " ");
}

// Distinctive prompt strings, so a substring search over the payload cannot
// pass by coincidence.
const PROMPTS = {
  critical: "PROMPT_CRITICAL_ROTATE_THE_LEAKED_STRIPE_KEY_NOW",
  high: "PROMPT_HIGH_ADD_A_CONTENT_SECURITY_POLICY_HEADER",
  medium1: "PROMPT_MEDIUM_ONE_SET_SAMESITE_ON_SESSION_COOKIES",
  medium2: "PROMPT_MEDIUM_TWO_DISABLE_DIRECTORY_LISTING",
  low: "PROMPT_LOW_SWITCH_THE_REDIRECT_TO_PERMANENT",
} as const;

function finding(over: Partial<Finding> & Pick<Finding, "severity" | "fixPrompt">): Finding {
  return {
    category: "headers",
    title: `finding-${over.severity}`,
    detail: "detail",
    ...over,
  } as Finding;
}

/**
 * Two categories, each holding a medium-severity finding.
 *
 * The second medium is the point of the fixture: sampling "the first medium in
 * each category" would hand out two prompts here and N on a real report, which
 * is the bug this shape exists to catch.
 */
function report(): ScanReport {
  return {
    url: "https://example.com/",
    scannedAt: "2026-08-17T12:00:00.000Z",
    durationMs: 3300,
    grade: "D",
    score: 48,
    summary: { critical: 1, high: 1, medium: 2, low: 1, info: 0, total: 5 },
    categories: [
      {
        id: "headers",
        label: "Security headers",
        passed: false,
        findings: [
          finding({ severity: "critical", fixPrompt: PROMPTS.critical, evidence: "key=sk_live_x" }),
          finding({ severity: "high", fixPrompt: PROMPTS.high }),
          finding({ severity: "medium", fixPrompt: PROMPTS.medium1 }),
        ],
      },
      {
        id: "exposed-endpoints",
        label: "Exposed files",
        passed: false,
        findings: [
          finding({ category: "exposed-endpoints", severity: "medium", fixPrompt: PROMPTS.medium2 }),
          finding({ category: "exposed-endpoints", severity: "low", fixPrompt: PROMPTS.low }),
        ],
      },
    ],
    notes: [],
  };
}

function allPublicFindings(pub: ReturnType<typeof toPublicReport>) {
  return pub.categories.flatMap((c) => c.findings);
}

console.log("Server-side paywall — offline regression checks\n");

// ── 1. The free payload ───────────────────────────────────────────────────

console.log("What a free visitor receives:");
{
  const pub = toPublicReport(report(), { entitlement: "free" });
  const findings = allPublicFindings(pub);
  const withPrompt = findings.filter((f) => f.fixPrompt);
  const json = JSON.stringify(pub);

  check(
    `exactly ${FREE_PROMPT_SAMPLES} prompt is included (found ${withPrompt.length})`,
    withPrompt.length === FREE_PROMPT_SAMPLES,
  );
  check(
    `and it is a ${SAMPLE_SEVERITY}-severity one`,
    withPrompt.every((f) => f.severity === SAMPLE_SEVERITY),
  );

  // Rule 2. The real test: not "is the field absent from the object I built"
  // but "is the text absent from the bytes that go over the wire".
  for (const [name, text] of Object.entries(PROMPTS)) {
    const isSample = text === withPrompt[0]?.fixPrompt;
    check(
      isSample
        ? `the ${name} prompt is the sample and is present`
        : `the ${name} prompt does not appear anywhere in the serialised payload`,
      json.includes(text) === isSample,
    );
  }

  check(
    "every withheld finding is marked locked",
    findings.filter((f) => !f.fixPrompt).every((f) => f.promptLocked),
  );
  check(
    "the sampled finding is not marked locked",
    withPrompt.every((f) => f.promptLocked === false),
  );
  check(
    `the locked count matches (${pub.lockedPromptCount})`,
    pub.lockedPromptCount === findings.length - FREE_PROMPT_SAMPLES,
  );
  check("the entitlement is stated in the payload", pub.entitlement === "free");

  // Everything a free visitor is *supposed* to get must still be there. A
  // paywall that also removes the free product is not a paywall.
  check("grade, score and summary survive", pub.grade === "D" && pub.score === 48 && pub.summary.total === 5);
  check("titles survive", findings.every((f) => f.title.length > 0));
  check("details survive", findings.every((f) => f.detail === "detail"));
  check("evidence survives", json.includes("key=sk_live_x"));
}

// ── 2. Sampling is global and deterministic ───────────────────────────────

console.log("\nSampling:");
{
  const first = toPublicReport(report(), { entitlement: "free" });
  const second = toPublicReport(report(), { entitlement: "free" });
  const promptOf = (p: ReturnType<typeof toPublicReport>) =>
    allPublicFindings(p).find((f) => f.fixPrompt)?.fixPrompt;

  check("the same report always samples the same finding", promptOf(first) === promptOf(second));
  check(
    "the sample is chosen across the whole report, not once per category",
    !JSON.stringify(first).includes(PROMPTS.medium2),
  );
}

console.log("\nWhen no finding has the sampled severity:");
{
  const noMedium = report();
  noMedium.categories = noMedium.categories.map((c) => ({
    ...c,
    findings: c.findings.filter((f) => f.severity !== "medium"),
  }));
  const pub = toPublicReport(noMedium, { entitlement: "free" });

  // Falling back to "then show a critical one instead" would give away the most
  // valuable prompt on exactly the reports where it matters most.
  check(
    "no prompt is given away instead",
    allPublicFindings(pub).every((f) => !f.fixPrompt),
  );
  check("and everything is locked", pub.lockedPromptCount === 3);
}

console.log("\nA finding with no prompt at all:");
{
  const noPrompt = report();
  noPrompt.categories[1].findings = [
    { category: "exposed-endpoints", severity: "info", title: "port 80 closed", detail: "d", fixPrompt: "" },
  ];
  const pub = toPublicReport(noPrompt, { entitlement: "free" });
  const info = allPublicFindings(pub).find((f) => f.severity === "info");

  // Marking it locked would advertise withheld content that does not exist.
  check("is not reported as locked", info?.promptLocked === false);
}

// ── 3. A member ───────────────────────────────────────────────────────────

console.log("\nWhat a member receives:");
{
  const pub = toPublicReport(report(), { entitlement: "member" });
  const json = JSON.stringify(pub);

  check(
    "every prompt is present",
    Object.values(PROMPTS).every((text) => json.includes(text)),
  );
  check("nothing is marked locked", allPublicFindings(pub).every((f) => !f.promptLocked));
  check("and the locked count is zero", pub.lockedPromptCount === 0);
}

// ── 4. Redaction is an allowlist, not a delete-list ───────────────────────

console.log("\nA field added to Finding tomorrow:");
{
  const withExtra = report();
  // Simulates a future `exploitPath`, `internalNotes`, `confidence` — anything
  // a later PR adds to Finding without thinking about this file. Spread-and-
  // delete would copy it straight through; an allowlist drops it.
  (withExtra.categories[0].findings[0] as unknown as Record<string, unknown>).internalExploitPath =
    "SECRET_FUTURE_FIELD_THAT_MUST_NOT_LEAK";

  const json = JSON.stringify(toPublicReport(withExtra, { entitlement: "free" }));
  check(
    "does not reach the public payload unless someone adds it here",
    !json.includes("SECRET_FUTURE_FIELD_THAT_MUST_NOT_LEAK"),
  );

  // And the mechanism, asserted directly — a passing test above could also be
  // satisfied by a delete-list that happens to name this field.
  const src = rendered("lib/scanner/publicReport.ts");
  check("publicReport.ts never spreads a finding", !/\.\.\.\s*finding\b/.test(src));
  check("and never deletes a field to redact it", !/\bdelete\s+\w+\.fixPrompt/.test(src));
}

// ── 5. The routes ─────────────────────────────────────────────────────────

console.log("\n/api/scan:");
{
  const src = rendered("app/api/scan/route.ts");
  check("returns toPublicReport(...)", /NextResponse\.json\(\s*toPublicReport\(/.test(src));
  check(
    "and never serialises the internal report",
    !/NextResponse\.json\(\s*report\s*[,)]/.test(src),
  );
  check("entitlement is resolved from the request", /entitlementFor\(\s*req\s*\)/.test(src));
}

console.log("\n/api/scan/[id]/prompts:");
{
  const src = source("app/api/scan/[id]/prompts/route.ts");
  const flat = rendered("app/api/scan/[id]/prompts/route.ts");

  check("checks entitlement", /entitlementFor\(/.test(flat));
  check("refuses a non-member with 402", /status:\s*402/.test(flat));

  // Ordering matters as much as presence. A check that runs after the read is
  // one refactor away from being a check that does not run.
  const entitlementAt = src.indexOf("entitlementFor(");
  const queryAt = src.indexOf("FROM scan");
  check(
    "and does so before reading the database",
    entitlementAt !== -1 && queryAt !== -1 && entitlementAt < queryAt,
  );

  check("enforces retention on read, not only by a scheduled job", /410/.test(flat));
}

// ── 6. Entitlement fails closed ───────────────────────────────────────────

console.log("\nEntitlement resolution:");
{
  const src = rendered("lib/entitlements.ts");
  check(
    'an unverifiable session resolves to "free"',
    /catch\s*\{[^}]*return\s*"free"/.test(src),
  );
  check(
    'only a verified session becomes "member"',
    /session\s*\?\s*"member"\s*:\s*"free"/.test(src),
  );
}

// ── 7. Nothing renders a prompt the server did not send ───────────────────

console.log("\nThe results component:");
{
  const src = rendered("components/ScanResults.tsx");
  check("is typed against PublicScanReport", /report:\s*PublicScanReport/.test(src));
  check(
    "renders the prompt only when one was sent",
    /finding\.fixPrompt\s*\?/.test(src),
  );
  check("and shows a lock state instead of hidden text", /promptLocked/.test(src));
}

// ── 8. No report reaches the RSC payload ──────────────────────────────────
//
// A scan run inside a server component would embed the whole internal report in
// the flight stream, where "view source" reaches it — a leak that no API-level
// check would ever see. The scan is client-initiated and must stay that way.

console.log("\nServer components:");
{
  for (const page of ["app/page.tsx", "app/preview/page.tsx", "app/dashboard/page.tsx"]) {
    const src = rendered(page);
    check(
      `${page} does not run a scan server-side`,
      !/from "@\/lib\/scanner"/.test(src) && !/\bawait\s+scan\(/.test(src),
    );
  }
}

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
