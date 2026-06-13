import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// GoHighLevel (LeadConnector) v2 API.
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

interface LeadBody {
  email?: string;
  url?: string;
  grade?: string;
  score?: number;
}

export async function POST(req: NextRequest) {
  const token = process.env.GHL_API_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  let body: LeadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  // Fail gracefully if GHL isn't wired up yet (keeps the UI honest).
  if (!token || !locationId) {
    return NextResponse.json(
      { error: "Lead capture isn't configured yet." },
      { status: 501 },
    );
  }

  const tags = ["secure-total-scan-lead"];
  if (body.grade) tags.push(`grade-${String(body.grade).toLowerCase()}`);
  if (typeof body.score === "number") tags.push(`score-${body.score}`);

  const payload: Record<string, unknown> = {
    email,
    locationId,
    source: "Secure Total Scan",
    tags,
  };
  // Stash the scanned URL on the standard website field (no custom field setup needed).
  if (body.url) payload.website = body.url;

  try {
    const res = await fetch(`${GHL_BASE}/contacts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return NextResponse.json({ ok: true });
    }

    const data = await res.json().catch(() => null);
    // GHL returns 400 with meta.contactId when the contact already exists.
    if (res.status === 400 && data?.meta?.contactId) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("GHL lead create failed:", res.status, data);
    return NextResponse.json(
      { error: data?.message ?? "Could not save your details. Please try again." },
      { status: 502 },
    );
  } catch (err) {
    console.error("GHL request error:", err);
    return NextResponse.json(
      { error: "Could not reach the CRM. Please try again." },
      { status: 502 },
    );
  }
}
