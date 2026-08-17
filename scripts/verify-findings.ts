// Offline regression tests for finding display.
//
// Every fixture below is a **real shape emitted by the backend**, copied from
// the agent that produces it, not invented for the test. That is the whole
// point: the bug this file guards against was not a logic error, it was a
// shape nobody had checked the renderer against.
//
// The rule under test: no finding the backend can produce may render as raw
// JSON at a customer. This dashboard is what the $19 and $49 tiers sell.
//
// Run: npm run verify:findings

import {
  findingLabel,
  findingLocation,
  findingMeta,
  findingRecommendation,
  isUnreadable,
} from "../lib/findings";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

// ── Real shapes, with the source of each ──────────────────────────────────

const SHAPES: { name: string; source: string; item: Record<string, unknown> }[] = [
  {
    name: "code finding",
    source: "tools/github_scanner.py — scan_file_for_patterns()",
    item: {
      category: "OWASP-A03",
      name: "SQL Injection",
      severity: "HIGH",
      recommendation: "Use parameterised queries instead of string interpolation.",
      file: "src/db/users.ts",
      line: 42,
      language: "TypeScript",
      snippet: "db.query(`SELECT * FROM users WHERE id = ${id}`)",
      source: "github_code_scan",
    },
  },
  {
    name: "OWASP vulnerability",
    source: "agents/vuln_scanner.py — OWASP_MAP",
    item: {
      category: "OWASP-A07",
      name: "Identification and Authentication Failures",
      severity: "HIGH",
      recommendation: "Add rate limiting and account lockout to authentication.",
      linked_anomaly: "brute_force",
    },
  },
  {
    name: "missing header",
    source: "agents/vuln_scanner.py — check_api_headers()",
    item: {
      header: "content-security-policy",
      severity: "MEDIUM",
      recommendation: "Add content-security-policy response header",
      fix_prompt: "Add the content-security-policy HTTP response header…",
    },
  },
  {
    name: "docker CVE",
    source: "tools/docker_scanner.py — Trivy findings",
    item: {
      name: "CVE-2023-45853",
      severity: "CRITICAL",
      description: "Out-of-bounds write in zlib MiniZip",
    },
  },
  {
    name: "docker metadata finding",
    source: "tools/docker_scanner.py — image checks",
    item: {
      name: "Using :latest tag",
      severity: "HIGH",
      description: "Image nginx:latest uses the mutable :latest tag",
    },
  },
  {
    name: "log anomaly",
    source: "tools/log_parser.py — detect_anomalies()",
    item: {
      type: "brute_force",
      source_ip: "192.168.1.100",
      attempt_count: 12,
      severity: "CRITICAL",
    },
  },
  {
    name: "compliance gap",
    source: "agents/policy_checker.py — map_to_nist()",
    item: {
      framework: "NIST CSF 2.0",
      control_id: "DE.CM-8",
      description: "Vulnerability scanning is not performed",
      severity: "HIGH",
    },
  },
];

console.log("Finding display — regression checks\n");

// ── 1. Nothing renders as raw JSON ────────────────────────────────────────

console.log("Every backend shape produces a readable label:");
for (const shape of SHAPES) {
  const label = findingLabel(shape.item);
  check(`${shape.name} — has a label (${shape.source})`, label !== "");
  check(`${shape.name} — label is not JSON`, !label.startsWith("{"));
  check(`${shape.name} — not flagged unreadable`, !isUnreadable(shape.item));
}

// ── 2. The three that were broken ─────────────────────────────────────────

console.log("\nThe shapes that used to render as raw JSON:");
check(
  "code finding shows its name",
  findingLabel(SHAPES[0]!.item) === "SQL Injection",
);
check(
  "OWASP vulnerability shows its name",
  findingLabel(SHAPES[1]!.item) === "Identification and Authentication Failures",
);
check(
  "missing header composes a label from `header`",
  findingLabel(SHAPES[2]!.item) === "Missing content-security-policy response header",
);

// ── 3. The shapes that already worked must not regress ────────────────────

console.log("\nShapes that already rendered correctly still do:");
check(
  "docker CVE prefers the readable description over the identifier",
  findingLabel(SHAPES[3]!.item) === "Out-of-bounds write in zlib MiniZip",
);
check(
  "docker CVE still surfaces the identifier as meta",
  findingMeta(SHAPES[3]!.item) === "CVE-2023-45853",
);
check(
  "compliance gap keeps its description",
  findingLabel(SHAPES[6]!.item) === "Vulnerability scanning is not performed",
);
check("log anomaly renders its type readably", findingLabel(SHAPES[5]!.item) === "brute force");

// ── 4. Recommendations are surfaced ───────────────────────────────────────

console.log("\nRemediation advice reaches the customer:");
check(
  "code finding shows its recommendation",
  findingRecommendation(SHAPES[0]!.item).startsWith("Use parameterised queries"),
);
check(
  "OWASP vulnerability shows its recommendation",
  findingRecommendation(SHAPES[1]!.item).startsWith("Add rate limiting"),
);
check(
  "a recommendation identical to the label is not repeated",
  findingRecommendation({ name: "Do the thing", recommendation: "Do the thing" }) === "",
);
check(
  "no recommendation is not an error",
  findingRecommendation(SHAPES[5]!.item) === "",
);

// ── 5. Location ───────────────────────────────────────────────────────────

console.log("\nLocation:");
check(
  "file and line are combined",
  findingLocation(SHAPES[0]!.item) === "src/db/users.ts:42",
);
check(
  "a file without a line still renders",
  findingLocation({ file: "Dockerfile" }) === "Dockerfile",
);
check("a line of 0 is not shown", findingLocation({ file: "a.ts", line: 0 }) === "a.ts");
check("no location is empty", findingLocation(SHAPES[1]!.item) === "");
check(
  "path and location are accepted as aliases",
  findingLocation({ path: "a/b.py" }) === "a/b.py" &&
    findingLocation({ location: "line 3" }) === "line 3",
);

// ── 6. Meta does not duplicate the label ──────────────────────────────────

console.log("\nMeta:");
check(
  "a code finding does not print its name twice",
  findingMeta(SHAPES[0]!.item) === "OWASP-A03",
);
check(
  "an OWASP vulnerability shows its category",
  findingMeta(SHAPES[1]!.item) === "OWASP-A07",
);
check("meta is empty when there is nothing extra", findingMeta({ message: "hello" }) === "");

// ── 7. Degenerate input ───────────────────────────────────────────────────

console.log("\nDegenerate input still fails safely:");
check("an empty object is flagged unreadable", isUnreadable({}));
check("whitespace-only text is not accepted as a label", isUnreadable({ name: "   " }));
check(
  "a non-string label is ignored rather than rendered as [object Object]",
  isUnreadable({ name: { nested: true } }),
);

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
