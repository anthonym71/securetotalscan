import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  createCustomerSession, createOwnerSession, createSession, verifySession,
} from "../lib/auth/session";
import { describeSession } from "../lib/auth/roleLabel";

async function main() {
  const names = ["STS_ACCESS_CODES", "STS_ACCESS_EXPIRES", "STS_AUTH_SECRET", "STS_OWNER_EMAIL", "STS_OWNER_ACCESS_CODE"];
  const original = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  const ownerCode = randomBytes(20).toString("hex");
  const customerCode = randomBytes(20).toString("hex");
  try {
    process.env.STS_AUTH_SECRET = randomBytes(32).toString("hex");
    process.env.STS_OWNER_EMAIL = "owner@example.test";
    process.env.STS_OWNER_ACCESS_CODE = ownerCode;
    process.env.STS_ACCESS_CODES = `pro:${customerCode}`;

    const owner = await verifySession(await createOwnerSession("owner@example.test", ownerCode));
    assert.ok(owner);
    assert.deepEqual(describeSession(owner), { kind: "owner", label: "Owner", email: "owner@example.test" });

    const legacy = await verifySession(await createSession("buyer@example.test", "pro"));
    assert.ok(legacy);
    assert.equal(describeSession(legacy).kind, "access-code");
    assert.equal(describeSession(legacy).label, "Customer via access code (pro)");

    const customer = await verifySession(await createCustomerSession("Buyer@Example.test", "business"));
    assert.ok(customer);
    assert.deepEqual(describeSession(customer), { kind: "customer", label: "Customer (business)", email: "buyer@example.test" });

    // A customer label called "owner" must not read as the owner role.
    const fake = await verifySession(await createSession("buyer@example.test", "owner"));
    assert.ok(fake);
    assert.equal(describeSession(fake).kind, "access-code");

    // The description never contains the access codes or signing secret.
    for (const s of [owner, legacy, customer, fake]) {
      const text = JSON.stringify(describeSession(s));
      for (const secret of [ownerCode, customerCode, process.env.STS_AUTH_SECRET!]) assert.ok(!text.includes(secret));
    }
    console.log("verify-session-role: ok");
  } finally {
    for (const n of names) {
      if (original[n] === undefined) delete process.env[n];
      else process.env[n] = original[n];
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
