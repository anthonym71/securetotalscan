import { createHash, randomBytes } from "node:crypto";
import { db } from "./client";

const MAGIC_TTL_MINUTES = 20;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueMagicLink(email: string): Promise<{ token: string; expiresAt: string } | null> {
  const rows = await db().query(
    `SELECT c.id
       FROM customer c
       JOIN subscription s ON s.customer_id = c.id
      WHERE lower(c.email) = lower($1)
        AND s.status = 'active'
        AND (s.renews_on IS NULL OR s.renews_on >= current_date)
      ORDER BY s.updated_at DESC
      LIMIT 1`,
    [email],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) return null;
  const customerId = String(rows[0].id);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_TTL_MINUTES * 60_000).toISOString();

  await db().query(
    `INSERT INTO magic_link (customer_id, token_hash, expires_at)
     VALUES ($1, $2, $3::timestamptz)`,
    [customerId, tokenHash, expiresAt],
    { arrayMode: false, fullResults: false },
  );
  return { token, expiresAt };
}

export async function consumeMagicLink(token: string): Promise<{ email: string; tier: string } | null> {
  const tokenHash = hashToken(token);
  const rows = await db().query(
    `UPDATE magic_link ml
        SET used_at = now()
       FROM customer c
       WHERE ml.customer_id = c.id
         AND ml.token_hash = $1
         AND ml.used_at IS NULL
         AND ml.expires_at > now()
       RETURNING c.id AS customer_id, c.email`,
    [tokenHash],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) return null;
  const customerId = String(rows[0].customer_id);
  const email = String(rows[0].email);

  const tierRows = await db().query(
    `SELECT tier
       FROM subscription
      WHERE customer_id = $1
        AND status = 'active'
        AND (renews_on IS NULL OR renews_on >= current_date)
      ORDER BY updated_at DESC
      LIMIT 1`,
    [customerId],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(tierRows) || !tierRows[0] || Array.isArray(tierRows[0])) return null;
  return { email, tier: String(tierRows[0].tier) };
}

export function monthlyCreditsForTier(tier: string): number {
  switch (tier.toLowerCase()) {
    case "business": return 100;
    case "pro": return 10;
    default: return 0;
  }
}

export async function ensureMonthlyCredits(email: string, tier: string): Promise<void> {
  const allowance = monthlyCreditsForTier(tier);
  if (allowance <= 0) return;
  const month = new Date().toISOString().slice(0, 7);
  const ref = `monthly:${email.toLowerCase()}:${tier.toLowerCase()}:${month}`;
  await db().query(
    `INSERT INTO credit_ledger (customer_id, subscription_id, delta, reason, external_ref)
     SELECT c.id, s.id, $3, 'monthly_allowance', $4
       FROM customer c
       JOIN LATERAL (
         SELECT id FROM subscription
          WHERE customer_id = c.id
            AND status = 'active'
            AND tier = $2
          ORDER BY updated_at DESC LIMIT 1
       ) s ON true
      WHERE lower(c.email) = lower($1)
     ON CONFLICT (external_ref) DO NOTHING`,
    [email, tier, allowance, ref],
    { arrayMode: false, fullResults: false },
  );
}

export async function creditBalance(email: string): Promise<number> {
  const rows = await db().query(
    `SELECT COALESCE(sum(cl.delta), 0)::int AS balance
       FROM credit_ledger cl
       JOIN customer c ON c.id = cl.customer_id
      WHERE lower(c.email) = lower($1)`,
    [email],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) return 0;
  return Number(rows[0].balance) || 0;
}

export async function spendCredit(email: string, externalRef: string): Promise<{ ok: boolean; balance: number }> {
  // PostgreSQL transaction semantics are emulated with one conditional INSERT:
  // only insert a debit when the current sum is positive. The unique external
  // reference makes retries idempotent.
  const rows = await db().query(
    `WITH target AS (
       SELECT c.id,
              COALESCE((SELECT sum(delta) FROM credit_ledger WHERE customer_id = c.id), 0) AS balance
         FROM customer c
        WHERE lower(c.email) = lower($1)
     ), ins AS (
       INSERT INTO credit_ledger (customer_id, delta, reason, external_ref)
       SELECT id, -1, 'deep_scan', $2 FROM target WHERE balance > 0
       ON CONFLICT (external_ref) DO NOTHING
       RETURNING customer_id
     )
     SELECT COALESCE((SELECT sum(delta) FROM credit_ledger cl
                       WHERE cl.customer_id = target.id), 0)::int AS balance,
            EXISTS(SELECT 1 FROM ins) AS spent
       FROM target`,
    [email, externalRef],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) return { ok: false, balance: 0 };
  return { ok: Boolean(rows[0].spent), balance: Number(rows[0].balance) || 0 };
}
