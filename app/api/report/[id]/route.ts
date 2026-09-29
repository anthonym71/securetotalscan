import { NextRequest, NextResponse } from "next/server";
import { readAuthorizedReport } from "@/lib/report/read";
import { entitlementFor } from "@/lib/entitlements";
import { toPublicReport } from "@/lib/scanner/publicReport";
import { renderReportPdf } from "@/lib/report/reportDoc";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await readAuthorizedReport(req, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, {
    status: result.status, headers: { "Cache-Control": "private, no-store" },
  });
  const visible = toPublicReport(result.report, { entitlement: await entitlementFor(req), scanId: id });
  const pdf = renderReportPdf(visible);
  return new NextResponse(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="secure-total-scan-${id}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
