import { NextRequest, NextResponse } from "next/server";
import { deleteExpiredScans, pendingRetentionWarnings, recordRetentionWarning } from "@/lib/db/retention";
import { sendRetentionWarningEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let warningsSent = 0;
  for (const days of [30, 7] as const) {
    const pending = await pendingRetentionWarnings(days);
    for (const item of pending) {
      const result = await sendRetentionWarningEmail(item.email, days, item.expiresAt);
      if (result.delivered) {
        await recordRetentionWarning(item);
        warningsSent += 1;
      }
    }
  }

  const deleted = await deleteExpiredScans();
  return NextResponse.json({ ok: true, warningsSent, deleted }, {
    headers: { "Cache-Control": "no-store" },
  });
}
