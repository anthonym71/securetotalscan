import { db } from "./client";

export type CommercialGrant =
  | { kind: "subscription"; tier: string; productId: string }
  | { kind: "purchase"; product: string; productId: string; amountCents?: number };

export interface PaidInvoice {
  invoiceId: string;
  email: string;
  ghlContactId?: string;
  amountPaid: number;
  currency: string;
  grants: CommercialGrant[];
}

async function upsertCustomer(email: string, ghlContactId?: string): Promise<string> {
  const rows = await db().query(
    `INSERT INTO customer (email, ghl_contact_id)
     VALUES ($1, $2)
     ON CONFLICT ((lower(email)))
     DO UPDATE SET ghl_contact_id = COALESCE(EXCLUDED.ghl_contact_id, customer.ghl_contact_id),
                   updated_at = now()
     RETURNING id`,
    [email, ghlContactId ?? null],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) {
    throw new Error("Customer upsert returned no id");
  }
  return String(rows[0].id);
}

// The unique indexes on subscription.external_id and purchase.external_id are
// partial (`WHERE external_id IS NOT NULL`, migrations/0001_init.sql). Postgres
// only matches ON CONFLICT to a partial index when the statement repeats the
// predicate; without it the insert fails with SQLSTATE 42P10 — reproduced on
// production on 2026-10-30 before any real invoice had arrived.
export async function recordPaidInvoice(invoice: PaidInvoice): Promise<{ customerId: string }> {
  const customerId = await upsertCustomer(invoice.email, invoice.ghlContactId);

  for (const grant of invoice.grants) {
    if (grant.kind === "subscription") {
      const externalId = `ghl-sub:${invoice.email}:${grant.productId}`;
      await db().query(
        `INSERT INTO subscription
           (customer_id, tier, status, external_id, renews_on)
         VALUES ($1, $2, 'active', $3, (current_date + interval '1 month')::date)
         ON CONFLICT (external_id) WHERE external_id IS NOT NULL
         DO UPDATE SET status = 'active',
                       tier = EXCLUDED.tier,
                       renews_on = (current_date + interval '1 month')::date,
                       ended_at = NULL,
                       updated_at = now()`,
        [customerId, grant.tier, externalId],
        { arrayMode: false, fullResults: false },
      );
    } else {
      const externalId = `ghl-invoice:${invoice.invoiceId}:${grant.productId}`;
      await db().query(
        `INSERT INTO purchase
           (customer_id, product, amount_cents, currency, status, external_id)
         VALUES ($1, $2, $3, $4, 'paid', $5)
         ON CONFLICT (external_id) WHERE external_id IS NOT NULL
         DO UPDATE SET status = 'paid'`,
        [customerId, grant.product, grant.amountCents ?? invoice.amountPaid, invoice.currency, externalId],
        { arrayMode: false, fullResults: false },
      );
    }
  }

  await db().query(
    `INSERT INTO event_log (customer_id, kind, detail)
     VALUES ($1, 'payment.invoice_paid',
       jsonb_build_object('invoice_id', $2::text, 'grant_count', $3::int))`,
    [customerId, invoice.invoiceId, invoice.grants.length],
    { arrayMode: false, fullResults: false },
  );

  return { customerId };
}

export async function activeEntitlementForEmail(email: string): Promise<{ tier: string } | null> {
  const rows = await db().query(
    `SELECT s.tier
       FROM subscription s
       JOIN customer c ON c.id = s.customer_id
      WHERE lower(c.email) = lower($1)
        AND s.status = 'active'
        AND (s.renews_on IS NULL OR s.renews_on >= current_date)
      ORDER BY s.updated_at DESC
      LIMIT 1`,
    [email],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) return null;
  return { tier: String(rows[0].tier) };
}

// ── Complimentary access ─────────────────────────────────────────────────────
// Owner-granted entitlement with no payment behind it: trials, partners, the
// owner's own account, support goodwill. It is the same `subscription` row a
// paid invoice would create, with external_id `manual:<tier>:<email>` so the
// HighLevel webhook never collides with it and a later paid invoice for the
// same customer simply adds its own row. `renews_on` NULL means "always",
// which every entitlement query already treats as never expiring.

export const COMPLIMENTARY_DURATIONS = ["day", "week", "month", "year", "always"] as const;
export type ComplimentaryDuration = (typeof COMPLIMENTARY_DURATIONS)[number];
export const COMPLIMENTARY_TIERS = ["pro", "business"] as const;
export type ComplimentaryTier = (typeof COMPLIMENTARY_TIERS)[number];

export interface ComplimentaryGrant {
  email: string;
  tier: string;
  renewsOn: string | null;
  grantedAt: string;
}

function durationInterval(duration: ComplimentaryDuration): string | null {
  switch (duration) {
    case "day": return "1 day";
    case "week": return "7 days";
    case "month": return "1 month";
    case "year": return "1 year";
    case "always": return null;
  }
}

export async function grantComplimentaryAccess(input: {
  email: string;
  tier: ComplimentaryTier;
  duration: ComplimentaryDuration;
  grantedBy: string;
}): Promise<ComplimentaryGrant> {
  const email = input.email.trim().toLowerCase();
  const customerId = await upsertCustomer(email);
  const externalId = `manual:${input.tier}:${email}`;
  const interval = durationInterval(input.duration);

  const rows = await db().query(
    `INSERT INTO subscription (customer_id, tier, status, external_id, renews_on)
     VALUES ($1, $2, 'active', $3,
             CASE WHEN $4::text IS NULL THEN NULL
                  ELSE (current_date + $4::interval)::date END)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL
     DO UPDATE SET status = 'active',
                   tier = EXCLUDED.tier,
                   renews_on = EXCLUDED.renews_on,
                   ended_at = NULL,
                   updated_at = now()
     RETURNING renews_on, updated_at`,
    [customerId, input.tier, externalId, interval],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) {
    throw new Error("Complimentary grant returned no row");
  }

  await db().query(
    `INSERT INTO event_log (customer_id, kind, detail)
     VALUES ($1, 'entitlement.granted_complimentary',
       jsonb_build_object('tier', $2::text, 'duration', $3::text, 'granted_by', $4::text))`,
    [customerId, input.tier, input.duration, input.grantedBy],
    { arrayMode: false, fullResults: false },
  );

  return {
    email,
    tier: input.tier,
    renewsOn: rows[0].renews_on ? String(rows[0].renews_on) : null,
    grantedAt: String(rows[0].updated_at),
  };
}

export async function revokeComplimentaryAccess(email: string, revokedBy: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const rows = await db().query(
    `UPDATE subscription s
        SET status = 'cancelled', ended_at = now(), updated_at = now()
       FROM customer c
      WHERE s.customer_id = c.id
        AND lower(c.email) = $1
        AND s.external_id LIKE 'manual:%'
        AND s.status = 'active'
      RETURNING c.id AS customer_id`,
    [normalized],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) return false;
  await db().query(
    `INSERT INTO event_log (customer_id, kind, detail)
     VALUES ($1, 'entitlement.revoked_complimentary', jsonb_build_object('revoked_by', $2::text))`,
    [String(rows[0].customer_id), revokedBy],
    { arrayMode: false, fullResults: false },
  );
  return true;
}

export async function listComplimentaryGrants(): Promise<ComplimentaryGrant[]> {
  const rows = await db().query(
    `SELECT c.email, s.tier, s.renews_on, s.updated_at
       FROM subscription s
       JOIN customer c ON c.id = s.customer_id
      WHERE s.external_id LIKE 'manual:%'
        AND s.status = 'active'
        AND (s.renews_on IS NULL OR s.renews_on >= current_date)
      ORDER BY s.updated_at DESC
      LIMIT 200`,
    [],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => Boolean(r) && !Array.isArray(r))
    .map((r) => ({
      email: String(r.email),
      tier: String(r.tier),
      renewsOn: r.renews_on ? String(r.renews_on) : null,
      grantedAt: String(r.updated_at),
    }));
}
