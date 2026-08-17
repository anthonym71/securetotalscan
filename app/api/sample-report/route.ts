// Download the sample report as a PDF.
//
// The same free projection the site shows inline, rendered through the same
// generator the real product uses, so the file a prospect downloads is exactly
// the file a free scan would produce — one unlocked prompt, the rest withheld.
// It is identical for every visitor and contains no personal data, so unlike the
// per-customer report route this one is cacheable.

import { NextResponse } from "next/server";
import { renderReportPdf } from "@/lib/report/reportDoc";
import { sampleFreeReport } from "@/lib/scanner/sampleReport";

export const runtime = "nodejs";

export function GET() {
  const pdf = renderReportPdf(sampleFreeReport());

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": 'attachment; filename="secure-total-scan-sample.pdf"',
      // Same for everyone, no personal data: safe to cache at the edge.
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
