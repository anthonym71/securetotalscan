import { NextRequest, NextResponse } from "next/server";
import { readAuthorizedReport } from "@/lib/report/read";
import { entitlementFor } from "@/lib/entitlements";
import { toPublicReport } from "@/lib/scanner/publicReport";

export const runtime = "nodejs";
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (await entitlementFor(req) === "free") return NextResponse.json({ error: "Member access required." }, {
    status: 403, headers: { "Cache-Control": "private, no-store" },
  });
  const { id } = await context.params;
  const result = await readAuthorizedReport(req, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, {
    status: result.status, headers: { "Cache-Control": "private, no-store" },
  });
  return NextResponse.json(toPublicReport(result.report, { entitlement: "member", scanId: id }), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
