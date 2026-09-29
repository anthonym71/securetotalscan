import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  createOwnerSession, createSession, isAccessConfigured, matchAccessCode,
  SESSION_TTL_SECONDS, verifySession,
} from "../lib/auth/session";

async function main() {
  const names = ["STS_ACCESS_CODES", "STS_ACCESS_EXPIRES", "STS_AUTH_SECRET", "STS_OWNER_EMAIL", "STS_OWNER_ACCESS_CODE"];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const ownerCode = randomBytes(20).toString("hex");
  const customerCode = randomBytes(20).toString("hex");
  try {
    for (const name of names) delete process.env[name];
    assert.equal(isAccessConfigured(), false);
    assert.equal(await createOwnerSession("owner@example.test", ownerCode), null);
    process.env.STS_OWNER_EMAIL = "owner@example.test";
    process.env.STS_OWNER_ACCESS_CODE = ownerCode;
    assert.equal(isAccessConfigured(), false, "owner needs an independent signing key");
    process.env.STS_AUTH_SECRET = "short";
    assert.equal(await createOwnerSession("owner@example.test", ownerCode), null);
    process.env.STS_AUTH_SECRET = randomBytes(32).toString("hex");
    assert.equal(isAccessConfigured(), true, "owner-only configuration permits login");
    assert.equal(await createOwnerSession("other@example.test", ownerCode), null);
    assert.equal(await createOwnerSession("owner@example.test", "wrong-code"), null);
    process.env.STS_ACCESS_EXPIRES = "2000-01-01";
    const owner = await createOwnerSession(" OWNER@EXAMPLE.TEST ", ownerCode);
    assert.ok(owner);
    const payload = await verifySession(owner);
    assert.equal(payload?.role, "owner");
    assert.equal(payload?.email, "owner@example.test");
    assert.ok(payload!.exp > Date.now() / 1000);
    assert.ok(payload!.exp <= Date.now() / 1000 + SESSION_TTL_SECONDS);
    assert.ok(!Buffer.from(owner.split(".")[0], "base64url").toString().includes(ownerCode));
    assert.equal(await verifySession(owner + ".extra"), null);
    const [body, signature] = owner.split(".");
    const changed = JSON.parse(Buffer.from(body, "base64url").toString());
    changed.email = "other@example.test";
    assert.equal(await verifySession(`${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`), null);

    process.env.STS_ACCESS_CODES = `owner:${customerCode}`;
    const ordinary = matchAccessCode(customerCode);
    assert.equal(ordinary?.label, "owner");
    assert.equal(await verifySession(await createSession("owner@example.test", ordinary!.label)), null,
      "customer label cannot bypass customer expiry");
    delete process.env.STS_ACCESS_EXPIRES;
    const customer = await createSession("customer@example.test", "pro");
    assert.equal((await verifySession(customer))?.role, undefined);
    assert.equal((await verifySession(customer))?.plan, "pro");
    process.env.STS_ACCESS_EXPIRES = "2000-01-01";
    assert.equal(await verifySession(customer), null);
    assert.equal((await verifySession(owner))?.role, "owner");

    process.env.STS_OWNER_ACCESS_CODE = randomBytes(20).toString("hex");
    assert.equal(await verifySession(owner), null, "code rotation revokes old owner cookies");
    process.env.STS_OWNER_ACCESS_CODE = ownerCode;
    process.env.STS_OWNER_EMAIL = "changed@example.test";
    assert.equal(await verifySession(owner), null, "email change revokes old owner cookies");
    process.env.STS_OWNER_EMAIL = "owner@example.test";
    delete process.env.STS_OWNER_ACCESS_CODE;
    assert.equal(await verifySession(owner), null, "removing owner access revokes its cookies");
    process.env.STS_OWNER_ACCESS_CODE = ownerCode;
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + (SESSION_TTL_SECONDS + 1) * 1000;
      assert.equal(await verifySession(owner), null, "owner sessions still expire");
    } finally { Date.now = realNow; }
    console.log("VERIFY: PASS — owner email/code checks, expiry separation, tamper resistance and revocation");
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
