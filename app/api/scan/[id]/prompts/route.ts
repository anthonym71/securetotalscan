// ──────────────────────────────────────────────────────────────
// Premium fix prompts for a recorded scan.
//
// The only route that serves prompts. `/api/scan` returns one sampled prompt
// and withholds the rest; this is where the rest live, behind a session check.
//
// It reads from the database rather than re-scanning. Re-running the scan would
// cost a second round of requests against the customer's site and could return
// different findings than the ones they are looking at — a customer paying to
// unlock "the 7 prompts" must receive prompts for those 7 findings, not for
// whatever the site looks like a minute later.
// ──────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { entitlementFor } from "@/lib/entitlements";
import { databaseConfigured, db } from "@/lib/db/client";
import type { CategoryResult } from "@/lib/scanner/types";

export const runtime = "nodejs";

/** A prompt, with just enough context to show it against the right finding. */
interface PromptEntry {
  category: string;
  severity: string;
  title: string;
  fixPrompt: string;
}

// Postgres rejects a malformed uuid with an error rather than an empty result,
// so the shape is checked here. A 404 for a nonsense id is also a smaller
// information leak than a 500 carrying a driver message.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Checked before anything else is done with the request. Any later ordering
  // invites a future edit that reads the row first "just to check it exists"
  // and then forgets to stop.
  const entitlement = await entitlementFor(req);
  if (entitlement !== "member") {
    return NextResponse.json(
      {
        error:
          "Fix prompts are part of a paid scan. Upgrade to unlock every prompt for this report.",
        entitlement,
      },
      { status: 402, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!databaseConfigured()) {
    // Distinguished from 404 deliberately. "We never stored it" and "it is not
    // there" look identical to a customer but mean opposite things to us.
    return NextResponse.json(
      { error: "Report storage is not configured in this environment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let rows: { findings: { categories?: CategoryResult[] } | null; expires_at: string }[];
  try {
    const sql = db();
    rows = (await sql`
      SELECT findings, expires_at
      FROM scan
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as typeof rows;
  } catch (err) {
    console.error(
      "prompts: read failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Could not load that report. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Retention is a promise, so it is enforced on read as well as by the Phase
  // 4.2 deletion job. A row that outlives its expiry because a scheduled job
  // did not run must still not be served — otherwise "six months" means "six
  // months, unless our cron was down".
  if (Date.parse(row.expires_at) <= Date.now()) {
    return NextResponse.json(
      { error: "This report has passed its six-month retention period." },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  const categories = row.findings?.categories ?? [];
  const prompts: PromptEntry[] = categories.flatMap((category) =>
    (category.findings ?? [])
      .filter((finding) => Boolean(finding.fixPrompt))
      .map((finding) => ({
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        fixPrompt: finding.fixPrompt,
      })),
  );

  return NextResponse.json(
    { scanId: id, prompts },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
