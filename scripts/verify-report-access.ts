import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { reportAccessToken, canReadReport } from "../lib/report/access";
import { readAuthorizedReport } from "../lib/report/read";
import * as client from "../lib/db/client";
import * as limits from "../lib/ratelimit";
import { entitlementFor } from "../lib/entitlements";
import { createSession, SESSION_COOKIE } from "../lib/auth/session";

async function main() {
  const id = randomUUID(), other = randomUUID();
  delete process.env.STS_AUTH_SECRET;
  assert.equal(reportAccessToken(id), null);
  process.env.STS_AUTH_SECRET = "short";
  assert.equal(reportAccessToken(id), null);
  process.env.STS_AUTH_SECRET = randomBytes(32).toString("hex");
  const token = reportAccessToken(id)!;
  assert.equal(canReadReport(id, `Bearer ${token}`), true);
  assert.equal(canReadReport(other, `Bearer ${token}`), false);
  assert.equal(canReadReport(id, null), false);
  assert.equal(canReadReport(id, `Bearer ${"0".repeat(64)}`), false);
  assert.equal(reportAccessToken("not-an-id"), null);
  let calls = 0;
  const report = { url: "https://example.test/", categories: [] };
  let expiry = new Date(Date.now() + 86400000).toISOString();
  Object.assign(client, { db: () => ({ query: async (sql: string, values: unknown[]) => {
    calls++;
    assert.equal(sql.includes("WHERE id = $1::uuid"), true);
    assert.deepEqual(values, [id]);
    return [{ findings: report, expires_at: expiry }];
  } }) });
  Object.assign(limits, { rateLimit: async () => ({ available: true, ok: true }) });
  const req = (access?: string) => new NextRequest(`https://example.test/api/report/${id}`, {
    headers: access ? { authorization: `Bearer ${access}` } : {},
  });
  assert.equal((await readAuthorizedReport(req(), id) as {status:number}).status, 401);
  assert.equal(calls, 0, "unauthorized requests must not read the database");
  assert.equal((await readAuthorizedReport(req(token), other) as {status:number}).status, 401);
  assert.equal(calls, 0, "scan A token cannot query scan B");
  assert.deepEqual(await readAuthorizedReport(req(token), id), { report });
  expiry = "invalid";
  assert.equal((await readAuthorizedReport(req(token), id) as {status:number}).status, 410);
  expiry = "2020-01-01T00:00:00Z";
  assert.equal((await readAuthorizedReport(req(token), id) as {status:number}).status, 410);
  Object.assign(limits, { rateLimit: async () => ({ available: true, ok: false }) });
  assert.equal((await readAuthorizedReport(req(token), id) as {status:number}).status, 429);
  Object.assign(limits, { rateLimit: async () => ({ available: false, ok: false }) });
  assert.equal((await readAuthorizedReport(req(token), id) as {status:number}).status, 503);
  process.env.STS_AUTH_SECRET = randomBytes(32).toString("hex");
  assert.equal(canReadReport(id, `Bearer ${token}`), false);
  assert.equal(await entitlementFor(req()), "free");
  process.env.STS_ACCESS_CODES = `pro:${randomBytes(16).toString("hex")}`;
  delete process.env.STS_ACCESS_EXPIRES;
  const session = await createSession("member@example.test", "pro");
  const member = new NextRequest("https://example.test/", { headers: { cookie: `${SESSION_COOKIE}=${session}` } });
  assert.equal(await entitlementFor(member), "member");
  const forged = new NextRequest("https://example.test/", { headers: { cookie: `${SESSION_COOKIE}=forged` } });
  assert.equal(await entitlementFor(forged), "free");
  console.log("PASS: report tokens, scan isolation, pre-query authorization, expiry and download limits");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
