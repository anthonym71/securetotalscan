import { NextRequest, NextResponse } from "next/server";
import { ScanError, scan } from "@/lib/scanner";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }

  try {
    const report = await scan(url);
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    if (err instanceof ScanError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("scan failed:", err);
    return NextResponse.json(
      { error: "The scan failed unexpectedly. Please try again." },
      { status: 500 },
    );
  }
}
