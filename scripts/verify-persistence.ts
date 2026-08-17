// Offline regression tests for scan persistence.
//
// Four rules are under test, and the first two are the ones that turn a
// database into an outage rather than a feature:
//
//   1. Unconfigured means silent. Local runs and CI have no DATABASE_URL and
//      must record nothing, without logging a line per scan.
//   2. A database problem must never reach the customer. `recordScan` cannot
//      throw, whatever the driver does — the scan result is the product, the
//      row is our bookkeeping.
//   3. Failures are counted and logged. Swallowed-and-uncounted is how a
//      writer dies unnoticed and the cohort is mysteriously empty six weeks
//      later. Same discipline as `postAlert`.
//   4. Values are bound as parameters, never interpolated into SQL. The target
//      URL is attacker-controlled by definition — it is the thing being
//      scanned — so this is the one place in the codebase where a formatting
//      shortcut would be a straightforward injection.
//
// These drive the real `@neondatabase/serverless` driver with `fetch` stubbed,
// rather than a hand-written fake of it. That costs a little setup and buys
// the thing that matters: the SQL under test is the SQL that would be sent.
//
// Run: npm run verify:persistence

import { __resetDbClient } from "../lib/db/client";
import {
  __resetScanWriteFailures,
  recordScan,
  scanWriteFailureCount,
} from "../lib/db/scans";
import type { ScanReport } from "../lib/scanner/types";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const realFetch = globalThis.fetch;
const realUrl = process.env.DATABASE_URL;
const realError = console.error;

// Not a real host. Nothing is dialled — `fetch` is replaced below — but the
// driver parses this before it sends anything, so it has to be well formed.
const FAKE_URL = "postgresql://user:pw@ep-verify-0000.eu-central-1.aws.neon.tech/sts?sslmode=require";

interface Sent {
  url: string;
  query: string;
  params: unknown[];
}

type Behaviour = "ok" | "no-rows" | "http500" | "throw";

function stubNeon(behaviour: Behaviour) {
  const sent: Sent[] = [];
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const request = init as { body?: string };
    let query = "";
    let params: unknown[] = [];
    try {
      const parsed = JSON.parse(String(request?.body ?? "{}"));
      query = String(parsed.query ?? "");
      params = Array.isArray(parsed.params) ? parsed.params : [];
    } catch {
      // Leave them empty — the assertions below will say so.
    }
    sent.push({ url: String(input), query, params });

    if (behaviour === "throw") throw new Error("connect ECONNREFUSED");
    if (behaviour === "http500") {
      return new Response(JSON.stringify({ message: "db is on fire" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        command: "INSERT",
        rowCount: behaviour === "no-rows" ? 0 : 1,
        fields:
          behaviour === "no-rows"
            ? []
            : [
                {
                  name: "id",
                  dataTypeID: 2950,
                  tableID: 0,
                  columnID: 1,
                  dataTypeSize: 16,
                  dataTypeModifier: -1,
                  format: "text",
                },
              ],
        rows: behaviour === "no-rows" ? [] : [["3f7d4c11-0000-4000-8000-abcdefabcdef"]],
        rowAsArray: true,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;
  return sent;
}

function captureErrors(): string[] {
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return lines;
}

function restore() {
  globalThis.fetch = realFetch;
  console.error = realError;
  if (realUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = realUrl;
  __resetDbClient();
  __resetScanWriteFailures();
}

function report(overrides: Partial<ScanReport> = {}): ScanReport {
  return {
    url: "https://Example.COM/pricing?ref=1",
    scannedAt: "2026-08-17T11:00:00.000Z",
    durationMs: 4210,
    grade: "C",
    score: 62,
    summary: { critical: 0, high: 2, medium: 3, low: 1, info: 4, total: 10 },
    categories: [
      {
        id: "headers",
        label: "Security headers",
        passed: false,
        findings: [
          {
            category: "headers",
            severity: "high",
            title: "Missing Content-Security-Policy",
            detail: "No CSP header was returned.",
            evidence: "https://example.com/",
            fixPrompt: "Add a Content-Security-Policy header.",
          },
        ],
      },
    ],
    notes: ["robots.txt was unreachable"],
    ...overrides,
  };
}

// Wrapped in main() rather than run at the top level: the verify scripts
// compile to CommonJS (tsconfig.verify.json), which has no top-level await.
async function main() {
  console.log("Scan persistence — offline regression checks\n");

  // ── 1. Unconfigured is a silent no-op ─────────────────────────────────────

  console.log("With no DATABASE_URL (local runs, CI, and every pull request):");
  {
    delete process.env.DATABASE_URL;
    __resetDbClient();
    __resetScanWriteFailures();
    const sent = stubNeon("ok");
    const logged = captureErrors();

    const result = await recordScan({ report: report(), kind: "surface" });

    console.error = realError;
    check("nothing is recorded", result.recorded === false);
    check(
      "and it says why, so a caller can tell 'off' from 'broken'",
      result.recorded === false && result.reason === "not-configured",
    );
    check("no request is made", sent.length === 0);
    check("nothing is logged — a line per scan in development is noise", logged.length === 0);
    check("and it is not counted as a failure", scanWriteFailureCount() === 0);
  }

  // ── 2. The happy path, and what actually goes over the wire ───────────────

  console.log("\nWith a database configured:");
  {
    restore();
    process.env.DATABASE_URL = FAKE_URL;
    __resetDbClient();
    const sent = stubNeon("ok");

    const result = await recordScan({
      report: report(),
      kind: "deep",
      costUsdMicros: 4200,
    });

    check("the scan is recorded", result.recorded === true);
    check(
      "and the row id comes back",
      result.recorded === true && result.id === "3f7d4c11-0000-4000-8000-abcdefabcdef",
    );
    check("exactly one statement is sent", sent.length === 1);

    const query = sent[0]?.query ?? "";
    const params = sent[0]?.params ?? [];

    check("it is an INSERT into scan", /insert\s+into\s+scan/i.test(query));

    // Rule 4. The target URL is chosen by whoever is using the scanner, so if it
    // ever appears in the query text rather than the parameter list, an attacker
    // is writing our SQL. Asserting on absence-from-query *and* presence-in-params
    // catches a driver change as well as a careless edit.
    check(
      "no value is interpolated into the SQL text",
      !query.includes("example.com") && !query.includes("Missing Content-Security-Policy"),
    );
    check(
      "the target URL is bound as a parameter",
      params.includes("https://Example.COM/pricing?ref=1"),
    );

    // Denormalised host, lowercased, no port or path — cohort queries group on
    // it, and "Example.COM" and "example.com" must not be two different sites.
    check("the host is stored lowercased", params.includes("example.com"));
    check("the kind is bound", params.includes("deep"));
    check("the grade is bound", params.includes("C"));
    check(
      "cost is bound in micros, not cents",
      params.some((p) => String(p) === "4200"),
    );
    check(
      "duration is bound",
      params.some((p) => String(p) === "4210"),
    );

    const findings = params.find(
      (p) => typeof p === "string" && p.trimStart().startsWith("{"),
    );
    check("findings are sent as one JSON parameter", typeof findings === "string");
    if (typeof findings === "string") {
      const parsed = JSON.parse(findings) as Record<string, unknown>;
      check(
        "and carry the categories, summary and notes",
        Array.isArray(parsed.categories) &&
          typeof parsed.summary === "object" &&
          Array.isArray(parsed.notes),
      );
      // The customer's email is never part of a scan row. It lives in `customer`
      // once accounts exist; until then it goes to the CRM and nowhere else.
      check(
        "and no email address rides along in the findings blob",
        !/@/.test(findings.replace(/https?:\/\/[^"]*/g, "")),
      );
    }
  }

  // ── 3. A malformed URL still produces a row ───────────────────────────────

  console.log("\nWhen the report URL cannot be parsed:");
  {
    restore();
    process.env.DATABASE_URL = FAKE_URL;
    __resetDbClient();
    const sent = stubNeon("ok");

    const result = await recordScan({ report: report({ url: "not a url" }), kind: "surface" });

    check("the scan is still recorded", result.recorded === true);
    check(
      "with an empty host rather than a lost row",
      (sent[0]?.params ?? []).includes(""),
    );
  }

  // ── 4. Failure is swallowed, counted and logged ───────────────────────────

  for (const behaviour of ["throw", "http500", "no-rows"] as const) {
    console.log(`\nWhen the database ${behaviour === "throw" ? "is unreachable" : behaviour === "http500" ? "returns an error" : "inserts nothing"}:`);
    restore();
    process.env.DATABASE_URL = FAKE_URL;
    __resetDbClient();
    stubNeon(behaviour);
    const logged = captureErrors();

    let threw = false;
    let result: Awaited<ReturnType<typeof recordScan>> | undefined;
    try {
      result = await recordScan({ report: report(), kind: "surface" });
    } catch {
      threw = true;
    }
    console.error = realError;

    check("recordScan does not throw — a scan must not 500 over bookkeeping", !threw);
    check("it reports the write failed", result?.recorded === false && result.reason === "failed");
    check("the failure is counted", scanWriteFailureCount() === 1);
    check("and logged", logged.length === 1);
    check(
      "the log carries the running count, so a slow bleed is visible",
      logged.some((line) => /failed write/i.test(line)),
    );
    // A connection string contains the password. It must never reach a log,
    // and driver errors are exactly where one tends to surface.
    check(
      "and never the connection string",
      !logged.some((line) => line.includes("pw@") || line.includes(FAKE_URL)),
    );
  }

  // ── 5. Counting accumulates ───────────────────────────────────────────────

  console.log("\nAcross repeated failures:");
  {
    restore();
    process.env.DATABASE_URL = FAKE_URL;
    __resetDbClient();
    stubNeon("throw");
    captureErrors();

    await recordScan({ report: report(), kind: "surface" });
    await recordScan({ report: report(), kind: "surface" });
    await recordScan({ report: report(), kind: "surface" });
    console.error = realError;

    check("every failure is counted, not just the first", scanWriteFailureCount() === 3);
  }

  restore();

  console.log(
    failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
