// ──────────────────────────────────────────────────────────────
// The branded scan report, as a PDF.
//
// **It renders from a `PublicScanReport`, never from the internal one.** That
// is the single most important line in this file. A PDF is the second way a
// scan report leaves the server, and PR 2.3 spent its entire length making the
// first way safe; a generator that took the internal report would quietly undo
// it, and would do so in a format nobody thinks to inspect. Taking the redacted
// type means the paywall is enforced by the function signature rather than by
// remembering — the same reason `/preview` renders through `lib/findings.ts`
// instead of its own copy.
//
// Consequence worth stating: this file cannot show a prompt the caller was not
// already entitled to, because it never receives one.
// ──────────────────────────────────────────────────────────────

import { BRAND } from "../brand";
import type { Grade, PublicFinding, PublicScanReport, Severity } from "../scanner/types";
import { PAGE_HEIGHT, PAGE_WIDTH, PdfDocument, rgb, textWidth, wrapText } from "./pdf";

const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_AT = PAGE_HEIGHT - 40;

const INK = rgb("#111827");
const MUTED = rgb("#6b7280");
const RULE = rgb("#e5e7eb");
const PANEL = rgb("#f9fafb");
const BRAND_COLOR = rgb("#4f46e5");

const GRADE_COLOR: Record<Grade, ReturnType<typeof rgb>> = {
  A: rgb("#16a34a"),
  B: rgb("#65a30d"),
  C: rgb("#ca8a04"),
  D: rgb("#ea580c"),
  F: rgb("#dc2626"),
};

const SEVERITY_COLOR: Record<Severity, ReturnType<typeof rgb>> = {
  critical: rgb("#dc2626"),
  high: rgb("#ea580c"),
  medium: rgb("#ca8a04"),
  low: rgb("#65a30d"),
  info: rgb("#6b7280"),
};

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

/**
 * A cursor that owns page breaks.
 *
 * Every writer here asks for vertical space before using it, so a finding never
 * starts three points above the footer and continues invisibly off the page —
 * the failure mode of laying a document out with a bare `y += height`.
 */
class Flow {
  y = MARGIN;

  constructor(
    readonly doc: PdfDocument,
    private readonly onNewPage: (doc: PdfDocument) => number,
  ) {
    doc.addPage();
    this.y = this.onNewPage(doc);
  }

  /** Ensure `height` points are available, starting a page if not. */
  need(height: number): void {
    if (this.y + height <= FOOTER_AT) return;
    this.doc.addPage();
    this.y = this.onNewPage(this.doc);
  }

  gap(height: number): void {
    this.y += height;
  }
}

function header(doc: PdfDocument): number {
  doc.rect(0, 0, PAGE_WIDTH, 4, BRAND_COLOR);
  doc.text(BRAND.name, MARGIN, 34, { font: "bold", size: 13, color: INK });
  doc.text("Security scan report", PAGE_WIDTH - MARGIN - textWidth("Security scan report", "regular", 9), 33, {
    size: 9,
    color: MUTED,
  });
  doc.line(MARGIN, 44, PAGE_WIDTH - MARGIN, RULE);
  return 68;
}

function paragraph(
  flow: Flow,
  text: string,
  options: { font?: "regular" | "bold"; size?: number; color?: ReturnType<typeof rgb>; leading?: number } = {},
): void {
  const { font = "regular", size = 9.5, color = INK } = options;
  const leading = options.leading ?? size * 1.45;
  for (const line of wrapText(text, font, size, CONTENT_WIDTH)) {
    flow.need(leading);
    flow.doc.text(line, MARGIN, flow.y + size, { font, size, color });
    flow.y += leading;
  }
}

function sectionTitle(flow: Flow, title: string): void {
  flow.need(34);
  flow.gap(10);
  flow.doc.text(title, MARGIN, flow.y + 11, { font: "bold", size: 11.5, color: INK });
  flow.y += 16;
  flow.doc.line(MARGIN, flow.y, PAGE_WIDTH - MARGIN, RULE);
  flow.y += 10;
}

function summaryBlock(flow: Flow, report: PublicScanReport): void {
  const boxHeight = 76;
  flow.need(boxHeight + 8);
  const top = flow.y;

  flow.doc.rect(MARGIN, top, CONTENT_WIDTH, boxHeight, PANEL);
  flow.doc.rect(MARGIN, top, 5, boxHeight, GRADE_COLOR[report.grade]);

  flow.doc.text(report.grade, MARGIN + 20, top + 46, {
    font: "bold",
    size: 40,
    color: GRADE_COLOR[report.grade],
  });

  const left = MARGIN + 86;
  flow.doc.text("TARGET", left, top + 18, { font: "bold", size: 7.5, color: MUTED });
  // Truncated rather than wrapped: a long URL would push the panel's fixed
  // height out from under everything drawn below it.
  const target = wrapText(report.url, "bold", 11, CONTENT_WIDTH - 120)[0] ?? report.url;
  flow.doc.text(target, left, top + 32, { font: "bold", size: 11, color: INK });

  flow.doc.text(
    `Score ${report.score}/100   ·   ${report.summary.total} finding${report.summary.total === 1 ? "" : "s"}   ·   scanned in ${(report.durationMs / 1000).toFixed(1)}s`,
    left,
    top + 50,
    { size: 9, color: MUTED },
  );
  flow.doc.text(`Scanned ${report.scannedAt}`, left, top + 64, { size: 8, color: MUTED });

  flow.y = top + boxHeight + 14;
}

function severityTable(flow: Flow, report: PublicScanReport): void {
  const rowHeight = 15;
  flow.need(rowHeight * SEVERITY_ORDER.length + 10);

  for (const severity of SEVERITY_ORDER) {
    const count = report.summary[severity];
    flow.doc.rect(MARGIN, flow.y + 3, 8, 8, SEVERITY_COLOR[severity]);
    flow.doc.text(severity.toUpperCase(), MARGIN + 16, flow.y + 10, {
      font: "bold",
      size: 8,
      color: INK,
    });
    flow.doc.text(String(count), MARGIN + 90, flow.y + 10, { size: 9, color: INK });
    flow.y += rowHeight;
  }
  flow.gap(4);
}

function findingBlock(flow: Flow, finding: PublicFinding, index: number): void {
  // Enough for the badge line, a title line and one line of detail. Anything
  // longer flows naturally; this only prevents a heading orphaned at the foot
  // of a page from its own body.
  flow.need(46);
  flow.gap(6);

  const badge = finding.severity.toUpperCase();
  flow.doc.rect(MARGIN, flow.y, textWidth(badge, "bold", 7) + 12, 12, SEVERITY_COLOR[finding.severity]);
  flow.doc.text(badge, MARGIN + 6, flow.y + 8.5, { font: "bold", size: 7, color: rgb("#ffffff") });

  const titleX = MARGIN + textWidth(badge, "bold", 7) + 20;
  const title = `${index}. ${finding.title}`;
  const titleLines = wrapText(title, "bold", 10, CONTENT_WIDTH - (titleX - MARGIN));
  flow.doc.text(titleLines[0], titleX, flow.y + 9.5, { font: "bold", size: 10, color: INK });
  flow.y += 16;
  for (const line of titleLines.slice(1)) {
    flow.need(13);
    flow.doc.text(line, MARGIN, flow.y + 9.5, { font: "bold", size: 10, color: INK });
    flow.y += 13;
  }

  paragraph(flow, finding.detail, { size: 9, color: INK });

  if (finding.evidence) {
    flow.gap(3);
    paragraph(flow, `Evidence: ${finding.evidence}`, { size: 8, color: MUTED });
  }

  if (finding.fixPrompt) {
    flow.gap(4);
    paragraph(flow, "Fix prompt — paste this into your AI tool:", {
      font: "bold",
      size: 8.5,
      color: BRAND_COLOR,
    });
    paragraph(flow, finding.fixPrompt, { size: 8.5, color: INK });
  } else if (finding.promptLocked) {
    // States what is withheld and why. The prompt text is not in this file to
    // withhold — `toPublicReport` never passed it here.
    flow.gap(4);
    paragraph(flow, "Fix prompt included with a paid scan.", { size: 8.5, color: MUTED });
  }

  flow.gap(4);
  flow.need(8);
  flow.doc.line(MARGIN, flow.y, PAGE_WIDTH - MARGIN, RULE);
  flow.gap(2);
}

const METHODOLOGY = [
  "This is a passive, unauthenticated scan. Every request it makes is one any visitor to the site could make: it reads the pages, headers and files the application already serves publicly. Nothing is injected, no credential is guessed, and no attempt is made to exploit anything found.",
  "Transport is checked by requesting the http:// origin directly, with redirects unfollowed, to establish whether a plaintext entry point exists and whether it reaches HTTPS. HSTS is read and parsed rather than merely counted as present.",
];

const LIMITATIONS = [
  "A clean result is not a guarantee of security. A passive scan cannot see server-side authorisation logic, business-logic flaws, anything behind a login, or a vulnerability in a dependency that is not disclosed in what the site serves.",
  "Findings describe the site at the moment it was scanned. A deploy made a minute later can change any of them.",
  "Severities are assigned by category, not by exploitability in your specific deployment. A finding marked high may be mitigated by a control this scan cannot see, and one marked low may matter more in your context than in general.",
];

/**
 * Render the report. Takes the **public** report and therefore cannot leak.
 */
export function renderReportPdf(report: PublicScanReport): Buffer {
  const doc = new PdfDocument();
  const flow = new Flow(doc, header);

  summaryBlock(flow, report);

  sectionTitle(flow, "Findings by severity");
  severityTable(flow, report);

  const findings = report.categories
    .flatMap((category) => category.findings)
    .sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );

  sectionTitle(flow, `Findings (${findings.length})`);

  if (findings.length === 0) {
    paragraph(
      flow,
      "No issues were detected in the passive scan. This is a good sign, but read the limitations below before treating it as a clean bill of health.",
      { color: MUTED },
    );
  } else {
    findings.forEach((finding, index) => findingBlock(flow, finding, index + 1));
  }

  if (report.lockedPromptCount > 0) {
    sectionTitle(flow, "What a paid scan adds");
    paragraph(
      flow,
      `${report.lockedPromptCount} fix prompt${report.lockedPromptCount === 1 ? " is" : "s are"} withheld from this report. Each is a specific, copy-paste instruction written against the finding above it — not generic advice. One is included in full so you can see exactly what you would be getting.`,
      { color: INK },
    );
  }

  // Transport is called out separately because it is the finding people most
  // often assume is fine: the site loads over HTTPS, so the http:// origin is
  // never checked.
  const transport = findings.filter(
    (finding) => finding.category === "ssl-tls" || /http|hsts|tls|ssl|transport/i.test(finding.title),
  );
  sectionTitle(flow, "HTTP and HTTPS posture");
  if (transport.length === 0) {
    paragraph(flow, "No transport issues were recorded for this target.", { color: MUTED });
  } else {
    for (const finding of transport) {
      paragraph(flow, `${finding.severity.toUpperCase()} — ${finding.title}`, {
        font: "bold",
        size: 9,
      });
      paragraph(flow, finding.detail, { size: 9, color: MUTED });
      flow.gap(3);
    }
  }

  if (report.notes.length > 0) {
    sectionTitle(flow, "What could not be scanned");
    for (const note of report.notes) paragraph(flow, `- ${note}`, { size: 9, color: MUTED });
  }

  sectionTitle(flow, "Methodology");
  for (const text of METHODOLOGY) paragraph(flow, text, { size: 9, color: MUTED });

  sectionTitle(flow, "Limitations");
  for (const text of LIMITATIONS) paragraph(flow, `- ${text}`, { size: 9, color: MUTED });

  // Footers last, because "page 2 of 5" needs a total that does not exist until
  // the final page does.
  const total = doc.pageCount;
  for (let index = 0; index < total; index += 1) {
    doc.onPage(index, (page) => {
      page.line(MARGIN, FOOTER_AT + 8, PAGE_WIDTH - MARGIN, RULE);
      page.text(`${BRAND.name} · ${BRAND.url}`, MARGIN, FOOTER_AT + 22, {
        size: 7.5,
        color: MUTED,
      });
      const label = `Page ${index + 1} of ${total}`;
      page.text(label, PAGE_WIDTH - MARGIN - textWidth(label, "regular", 7.5), FOOTER_AT + 22, {
        size: 7.5,
        color: MUTED,
      });
    });
  }

  return doc.build();
}
