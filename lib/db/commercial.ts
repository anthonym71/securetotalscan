import { db } from "./client";

export type CommercialGrant =
  | { kind: "subscription"; tier: string; productId: string }
  | { kind: "purchase"; product: string; productId: string };

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
     ON CONFLICT (lower(email))
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

export async function recordPaidInvoice(invoice: PaidInvoice): Promise<{ customerId: string }> {
  const customerId = await upsertCustomer(invoice.email, invoice.ghlContactId);

  for (const grant of invoice.grants) {
    if (grant.kind === "subscription") {
      const externalId = `ghl-sub:${invoice.email}:${grant.productId}`;
      await db().query(
        `INSERT INTO subscription
           (customer_id, tier, status, external_id, renews_on)
         VALUES ($1, $2, 'active', $3, (current_date + interval '1 month')::date)
         ON CONFLICT (external_id)
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
         ON CONFLICT (external_id)
         DO UPDATE SET status = 'paid'`,
        [customerId, grant.product, invoice.amountPaid, invoice.currency, externalId],
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
