import { createHmac, timingSafeEqual } from "node:crypto";

export const SCAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A report id alone never authorizes access. Keep tokens out of URLs/logs. */
export function reportAccessToken(id: string): string | null {
  const secret = process.env.STS_AUTH_SECRET ?? "";
  if (secret.length < 32 || !SCAN_ID.test(id)) return null;
  return createHmac("sha256", secret).update(`sts-report-read-v1:${id.toLowerCase()}`).digest("hex");
}

export function canReadReport(id: string, authorization: string | null): boolean {
  const supplied = /^Bearer ([0-9a-f]{64})$/.exec(authorization ?? "")?.[1];
  const expected = reportAccessToken(id);
  return Boolean(supplied && expected && timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex")));
}
