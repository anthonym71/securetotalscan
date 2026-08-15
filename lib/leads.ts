// GoHighLevel (LeadConnector) v2 contact creation, shared by /api/lead and
// the email capture that now gates the free scan.

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface LeadInput {
  email: string;
  url?: string;
  grade?: string;
  score?: number;
  /** Extra tags, e.g. the capture point. */
  tags?: string[];
}

export type LeadResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; status: number; error: string };

export async function createLead(input: LeadInput): Promise<LeadResult> {
  const token = process.env.GHL_API_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    return { ok: false, status: 501, error: "Lead capture isn't configured yet." };
  }

  const tags = ["secure-total-scan-lead", ...(input.tags ?? [])];
  if (input.grade) tags.push(`grade-${String(input.grade).toLowerCase()}`);
  if (typeof input.score === "number") tags.push(`score-${input.score}`);

  const payload: Record<string, unknown> = {
    email: input.email,
    locationId,
    source: "Secure Total Scan",
    tags,
  };
  // Stash the scanned URL on the standard website field (no custom field setup needed).
  if (input.url) payload.website = input.url;

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

    if (res.ok) return { ok: true };

    const data = await res.json().catch(() => null);
    // GHL returns 400 with meta.contactId when the contact already exists.
    if (res.status === 400 && data?.meta?.contactId) {
      return { ok: true, duplicate: true };
    }
    console.error("GHL lead create failed:", res.status, data);
    return {
      ok: false,
      status: 502,
      error: data?.message ?? "Could not save your details. Please try again.",
    };
  } catch (err) {
    console.error("GHL request error:", err);
    return {
      ok: false,
      status: 502,
      error: "Could not reach the CRM. Please try again.",
    };
  }
}
