import { NextRequest, NextResponse } from "next/server";
import { recordPaidInvoice } from "@/lib/db/commercial";
import { parsePaidInvoice, verifyGhlSignature } from "@/lib/integrations/ghlWebhook";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-ghl-signature");
  if (!verifyGhlSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const invoice = parsePaidInvoice(payload as Parameters<typeof parsePaidInvoice>[0]);
  if (!invoice) {
    // Authentic but not one of our mapped paid products. Acknowledge so HighLevel
    // does not retry an event that cannot safely grant an entitlement.
    return NextResponse.json({ accepted: true, granted: false }, { status: 200 });
  }

  await recordPaidInvoice(invoice);
  return NextResponse.json({ accepted: true, granted: true }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
