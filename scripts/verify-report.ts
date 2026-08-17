// Offline regression tests for the PDF report.
//
// The report is the **second** way a scan leaves the server. PR 2.3 made the
// JSON safe; if the PDF path were not held to the same rule, the paywall would
// have a hole in the format least likely to be inspected — nobody greps a
// binary attachment.
//
// So the central checks here search the **generated PDF bytes** for withheld
// prompt text, exactly as `verify-paywall.ts` searches the serialised JSON. The
// document is written uncompressed partly for that reason: a compressed content
// stream would hide a leak from this test, and a test that cannot see the leak
// it exists to catch is decoration.
//
// The rest covers the file being a real PDF rather than something that merely
// starts with `%PDF`. The failure mode of a hand-written generator is a file
// that opens in a forgiving reader and is rejected by a strict one, so the xref
// offsets are checked byte by byte against the objects they point at.
//
// Run: npm run verify:report

import { renderReportPdf } from "../lib/report/reportDoc";
import { PdfDocument, escapeText, textWidth, toAscii, wrapText } from "../lib/report/pdf";
import { toPublicReport } from "../lib/scanner/publicReport";
import type { Finding, ScanReport } from "../lib/scanner/types";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const PROMPTS = {
  critical: "PROMPT_CRITICAL_ROTATE_THE_LEAKED_KEY",
  high: "PROMPT_HIGH_ADD_A_CSP_HEADER",
  medium: "PROMPT_MEDIUM_SET_SAMESITE_ON_COOKIES",
  low: "PROMPT_LOW_MAKE_THE_REDIRECT_PERMANENT",
} as const;

function finding(over: Partial<Finding> & Pick<Finding, "severity" | "fixPrompt">): Finding {
  return {
    category: "headers",
    title: `Finding at ${over.severity} severity`,
    detail: "A sentence of detail long enough to wrap across more than one line in the rendered document, which is what the layout has to cope with.",
    ...over,
  } as Finding;
}

function report(): ScanReport {
  return {
    url: "https://example.com/",
    scannedAt: "2026-08-17T12:00:00.000Z",
    durationMs: 4200,
    grade: "D",
    score: 44,
    summary: { critical: 1, high: 1, medium: 1, low: 1, info: 0, total: 4 },
    categories: [
      {
        id: "headers",
        label: "Security headers",
        passed: false,
        findings: [
          finding({ severity: "critical", fixPrompt: PROMPTS.critical, evidence: "sk_live_EXAMPLE" }),
          finding({ severity: "high", fixPrompt: PROMPTS.high }),
          finding({ severity: "medium", fixPrompt: PROMPTS.medium }),
        ],
      },
      {
        id: "ssl-tls",
        label: "Transport",
        passed: false,
        findings: [
          finding({
            category: "ssl-tls",
            severity: "low",
            title: "HTTP redirects to HTTPS with a temporary redirect",
            fixPrompt: PROMPTS.low,
          }),
        ],
      },
    ],
    notes: ["robots.txt was unreachable"],
  };
}

console.log("PDF report — offline regression checks\n");

// ── 1. The paywall holds in the second serialisation ──────────────────────

console.log("A free visitor's PDF:");
{
  const pdf = renderReportPdf(toPublicReport(report(), { entitlement: "free" }));
  const bytes = pdf.toString("latin1");

  check("is a PDF", bytes.startsWith("%PDF-1.4"));
  check("and is terminated", bytes.trimEnd().endsWith("%%EOF"));

  // The point of this file.
  for (const [name, text] of Object.entries(PROMPTS)) {
    const shouldAppear = name === "medium"; // the sampled severity
    check(
      shouldAppear
        ? `the ${name} prompt is the free sample and appears`
        : `the ${name} prompt does not appear anywhere in the PDF bytes`,
      bytes.includes(text) === shouldAppear,
    );
  }

  check("the withholding is stated rather than hidden", bytes.includes("included with a paid scan"));
  check("and the count of what is withheld is shown", bytes.includes("fix prompt"));

  // The free product still has to be in there.
  check("the grade is rendered", bytes.includes("(D) Tj"));
  check("the target is rendered", bytes.includes("example.com"));
  check("evidence survives", bytes.includes("sk_live_EXAMPLE"));
  check("methodology is included", bytes.includes("passive, unauthenticated scan"));
  check("limitations are included", bytes.includes("not a guarantee of security"));
  check("the transport section is included", bytes.includes("HTTP and HTTPS posture"));
}

console.log("\nA member's PDF:");
{
  const pdf = renderReportPdf(toPublicReport(report(), { entitlement: "member" }));
  const bytes = pdf.toString("latin1");

  check(
    "contains every prompt",
    Object.values(PROMPTS).every((text) => bytes.includes(text)),
  );
  check(
    "and does not advertise withheld content",
    !bytes.includes("included with a paid scan"),
  );
}

// ── 2. It is a structurally valid PDF ─────────────────────────────────────
//
// A hand-written generator fails by producing a file that a forgiving reader
// opens and a strict one rejects. The xref table is where that happens: every
// entry is a byte offset, so one multi-byte character earlier in the file puts
// all of them out.

console.log("\nStructure:");
{
  const pdf = renderReportPdf(toPublicReport(report(), { entitlement: "member" }));
  const bytes = pdf.toString("latin1");

  const startxref = /startxref\s+(\d+)/.exec(bytes);
  check("declares startxref", Boolean(startxref));

  const xrefAt = Number(startxref?.[1] ?? -1);
  check("which points at the xref table", bytes.slice(xrefAt, xrefAt + 4) === "xref");

  const size = /\/Size\s+(\d+)/.exec(bytes);
  check("the trailer declares a size", Boolean(size));

  const count = Number(size?.[1] ?? 0);
  const entries = [...bytes.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
    Number(m[1]),
  );
  check(`the xref lists every object (${entries.length} of ${count - 1})`, entries.length === count - 1);

  // Each offset must land exactly on "<id> 0 obj".
  const misaligned = entries.filter((offset, index) => {
    const expected = `${index + 1} 0 obj`;
    return bytes.slice(offset, offset + expected.length) !== expected;
  });
  check(
    `every xref offset lands on its object${misaligned.length ? ` — ${misaligned.length} do not` : ""}`,
    misaligned.length === 0,
  );

  check("the catalog is object 1", /1 0 obj\s*<< \/Type \/Catalog/.test(bytes));
  check("both base-14 fonts are declared", bytes.includes("/Helvetica-Bold") && bytes.includes("/BaseFont /Helvetica "));
  check("no font is embedded, so the file stays small", !bytes.includes("/FontFile"));
  check("the file is a sensible size for a 4-finding report", pdf.length > 2000 && pdf.length < 200_000);

  // Every content stream's declared /Length must match its actual bytes, or a
  // strict reader stops mid-page.
  const lengths = [...bytes.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
  const wrong = lengths.filter((match) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = bytes.indexOf("\nendstream", start);
    return end - start !== Number(match[1]);
  });
  check(
    `every stream /Length matches its content${wrong.length ? ` — ${wrong.length} do not` : ""}`,
    lengths.length > 0 && wrong.length === 0,
  );
}

// ── 3. Pagination ─────────────────────────────────────────────────────────

console.log("\nPagination:");
{
  const many = report();
  many.categories[0].findings = Array.from({ length: 40 }, (_, i) =>
    finding({ severity: "high", fixPrompt: `PROMPT_BULK_${i}`, title: `Bulk finding ${i}` }),
  );
  const pdf = renderReportPdf(toPublicReport(many, { entitlement: "member" }));
  const bytes = pdf.toString("latin1");

  const pageCount = Number(/\/Count (\d+)/.exec(bytes)?.[1] ?? 0);
  check(`40 findings produce multiple pages (${pageCount})`, pageCount > 1);
  check("every page is declared in the page tree", (bytes.match(/\/Type \/Page[^s]/g) ?? []).length === pageCount);
  check("the footer numbers them with a real total", bytes.includes(`Page 1 of ${pageCount}`));
  check("and the last page carries the last number", bytes.includes(`Page ${pageCount} of ${pageCount}`));

  // Nothing may be drawn below the footer rule.
  const yPositions = [...bytes.matchAll(/^([\d.]+) ([\d.]+) Td$/gm)].map((m) => Number(m[2]));
  check(
    "no text is positioned off the bottom of a page",
    yPositions.length > 0 && yPositions.every((y) => y >= 0),
  );
}

// ── 4. Text handling ──────────────────────────────────────────────────────

console.log("\nText:");
{
  check("parentheses are escaped", escapeText("a (b) c") === "a \\(b\\) c");
  check("backslashes are escaped", escapeText("a\\b") === "a\\\\b");
  check("em dashes become hyphens", toAscii("a — b") === "a - b");
  check("curly quotes become straight", toAscii("‘a’ “b”") === "'a' \"b\"");
  check("unmappable characters do not vanish silently", toAscii("emoji \u{1F600}").includes("?"));

  check("bold is wider than regular at the same size", textWidth("Security", "bold", 10) > textWidth("Security", "regular", 10));
  check("width scales with size", Math.abs(textWidth("abc", "regular", 20) - textWidth("abc", "regular", 10) * 2) < 0.01);

  const wrapped = wrapText("the quick brown fox jumps over the lazy dog", "regular", 10, 60);
  check("wrapping produces multiple lines", wrapped.length > 1);
  check("and every line fits", wrapped.every((line) => textWidth(line, "regular", 10) <= 60));

  // Evidence fields are full of long unbroken strings; without a hard split
  // they run off the page edge and are simply not readable.
  const long = wrapText("a".repeat(400), "regular", 10, 100);
  check("an unbreakable word is hard-split", long.length > 1);
  check("and the split respects the width", long.every((line) => textWidth(line, "regular", 10) <= 100));

  const single = wrapText("short", "regular", 10, 500);
  check("a short string stays on one line", single.length === 1 && single[0] === "short");
}

// ── 5. Empty and degenerate reports ───────────────────────────────────────

console.log("\nA clean scan:");
{
  const clean = report();
  clean.categories = [];
  clean.summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
  clean.notes = [];

  const pdf = renderReportPdf(toPublicReport(clean, { entitlement: "free" }));
  const bytes = pdf.toString("latin1");

  check("still renders", bytes.startsWith("%PDF") && pdf.length > 1000);
  check("says so plainly", bytes.includes("No issues were detected"));
  // The most important line on a clean report: a passive scan finding nothing
  // is not a clean bill of health, and saying otherwise is the claim this
  // project has been removing from the site all day.
  check("and does not claim the site is secure", !bytes.includes("is secure"));
  check("limitations are still present", bytes.includes("not a guarantee of security"));
}

console.log("\nAn empty document:");
{
  const doc = new PdfDocument();
  const bytes = doc.build().toString("latin1");
  check("builds a valid single page rather than throwing", bytes.includes("/Count 1"));
}

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
