import { db } from "./client";

export interface RetentionWarning {
  scanId: string;
  email: string;
  expiresAt: string;
  days: 30 | 7;
}

export async function pendingRetentionWarnings(days: 30 | 7): Promise<RetentionWarning[]> {
  const rows = await db().query(
    `SELECT s.id AS scan_id, c.email, s.expires_at
       FROM scan s
       JOIN customer c ON c.id = s.customer_id
      WHERE s.expires_at > now()
        AND s.expires_at <= now() + ($1 || ' days')::interval
        AND s.expires_at > now() + (($1 - 1) || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM event_log e
           WHERE e.customer_id = s.customer_id
             AND e.kind = $2
             AND e.detail->>'scan_id' = s.id::text
        )
      ORDER BY s.expires_at
      LIMIT 500`,
    [days, `retention.warning.${days}`],
    { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => !Array.isArray(r)).map((r) => ({
    scanId: String(r.scan_id),
    email: String(r.email),
    expiresAt: new Date(r.expires_at).toISOString(),
    days,
  }));
}

export async function recordRetentionWarning(item: RetentionWarning): Promise<void> {
  await db().query(
    `INSERT INTO event_log (customer_id, kind, detail)
     SELECT c.id, $2, jsonb_build_object('scan_id', $3::text, 'expires_at', $4::text)
       FROM customer c WHERE lower(c.email) = lower($1)`,
    [item.email, `retention.warning.${item.days}`, item.scanId, item.expiresAt],
    { arrayMode: false, fullResults: false },
  );
}

export async function deleteExpiredScans(): Promise<number> {
  const rows = await db().query(
    `WITH doomed AS (
       SELECT id, customer_id FROM scan WHERE expires_at <= now() LIMIT 1000
     ), log_rows AS (
       INSERT INTO event_log (customer_id, kind, detail)
       SELECT customer_id, 'scan.deleted', jsonb_build_object('scan_id', id::text, 'reason', 'retention_expired')
         FROM doomed
     ), detach AS (
       UPDATE purchase SET scan_id = NULL WHERE scan_id IN (SELECT id FROM doomed)
     ), reports AS (
       DELETE FROM report WHERE scan_id IN (SELECT id FROM doomed)
     )
     DELETE FROM scan WHERE id IN (SELECT id FROM doomed)
     RETURNING id`,
    [],
    { arrayMode: false, fullResults: false },
  );
  return Array.isArray(rows) ? rows.length : 0;
}
