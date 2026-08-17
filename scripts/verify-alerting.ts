// Offline regression tests for operational alerting.
//
// Three rules are under test, and each has cost someone a real outage
// somewhere:
//
//   1. Unconfigured means silent. Local runs and CI must never try to page.
//   2. Nothing sensitive leaves the process — no secrets, no tokens, and no
//      raw email addresses, since the endpoint belongs to a third party.
//   3. A failing endpoint must never break the caller, but must be counted,
//      because silent-and-uncounted is how an alert path dies unnoticed.
//
// Run: npm run verify:alerting

import { createHmac } from "node:crypto";
import {
  __resetAlertFailureCount,
  alertFailureCount,
  alertingConfigured,
  buildPayload,
  customerRef,
  postAlert,
  redact,
  signPayload,
} from "../lib/alerting";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const realFetch = globalThis.fetch;

interface Captured {
  url: string;
  body: string;
  headers: Record<string, string>;
}

function stubEndpoint(behaviour: "ok" | "http500" | "throw" | "hang") {
  const captured: Captured[] = [];
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const request = init as {
      body?: string;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    };
    captured.push({
      url: String(input),
      body: String(request?.body ?? ""),
      headers: (request?.headers ?? {}) as Record<string, string>,
    });
    if (behaviour === "throw") throw new Error("connect ECONNREFUSED");
    if (behaviour === "http500") return new Response("nope", { status: 500 });
    if (behaviour === "hang") {
      // A real fetch rejects when its AbortSignal fires, so the stub must too
      // — otherwise this would measure the stub's own sleep rather than the
      // caller's timeout. The 30s backstop timer is not there to fire: it
      // keeps the event loop alive, because the timer behind
      // `AbortSignal.timeout()` is unref'd and Node would otherwise exit
      // cleanly while this promise is still pending, silently skipping the
      // remaining checks.
      await new Promise((_resolve, reject) => {
        const signal = request?.signal;
        const backstop = setTimeout(() => reject(new Error("stub: never aborted")), 30_000);
        const fail = () => {
          clearTimeout(backstop);
          reject(signal?.reason ?? new Error("aborted"));
        };
        if (!signal) return;
        if (signal.aborted) fail();
        else signal.addEventListener("abort", fail);
      });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return captured;
}

const SECRET = "test-signing-secret";

function configure(on: boolean) {
  if (on) {
    process.env.ALERT_WEBHOOK_URL = "https://alerts.example.test/hook/wh_token";
    process.env.ALERT_WEBHOOK_SECRET = SECRET;
  } else {
    delete process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_WEBHOOK_SECRET;
  }
}

async function main() {
  console.log("Operational alerting — regression checks\n");

  // 1. Unconfigured is silent, and does not touch the network.
  configure(false);
  const silent = stubEndpoint("ok");
  check("unconfigured: alertingConfigured() is false", !alertingConfigured());
  const off = await postAlert({ severity: "critical", kind: "x", dedupeKey: "x" });
  check(
    "unconfigured: reports not-configured",
    off.sent === false && off.reason === "not-configured",
  );
  check("unconfigured: sends nothing", silent.length === 0);
  check("unconfigured: customerRef is empty", customerRef("a@b.com") === "");

  // 2. Configured: the payload is signed over its exact bytes.
  configure(true);
  __resetAlertFailureCount();
  const sent = stubEndpoint("ok");
  const ok = await postAlert({
    severity: "critical",
    kind: "backend-down",
    site: "securetotalscan.com",
    detail: "Backend did not respond.",
    dedupeKey: "backend-down",
  });
  check("configured: reports sent", ok.sent);
  check("configured: posts exactly once", sent.length === 1);

  const call = sent[0]!;
  const expected = `sha256=${createHmac("sha256", SECRET).update(call.body).digest("hex")}`;
  check("signature: matches HMAC-SHA256 of the exact body", call.headers["x-sts-signature"] === expected);
  check("signature: helper agrees with the sent header", signPayload(call.body, SECRET) === expected);
  check("timestamp: sent as epoch seconds", /^\d{10}$/.test(call.headers["x-sts-timestamp"] ?? ""));
  check("transport: content-type is JSON", call.headers["Content-Type"] === "application/json");

  const payload = JSON.parse(call.body);
  check("payload: carries every required field", [
    "severity", "kind", "site", "customer", "detail", "occurred_at", "dedupe_key", "source",
  ].every((key) => key in payload));
  check("payload: severity survives", payload.severity === "critical");
  check("payload: dedupe_key is stable and timestamp-free", payload.dedupe_key === "backend-down");
  check("payload: identifies the sender", payload.source === "web");
  check("payload: occurred_at is ISO 8601", !Number.isNaN(Date.parse(payload.occurred_at)));

  // 3. Nothing sensitive travels.
  const dirty = redact(
    "failed for anthony@timetothrivenow.com with Authorization: Bearer sk_live_abcdef123456 and api_key=zzzz",
  );
  check("redact: strips email addresses", !dirty.includes("@"));
  check("redact: strips bearer credentials", !/bearer\s+\S+/i.test(dirty));
  check("redact: strips sk_ style keys", !dirty.includes("sk_live_abcdef123456"));
  check("redact: strips key=value secrets", !dirty.includes("zzzz"));
  check("redact: truncates to 500 characters", redact("x".repeat(2000)).length <= 500);

  const leaky = buildPayload(
    {
      severity: "warning",
      kind: "scan-unhandled-error",
      site: "example.com",
      detail: "scan for user@example.com failed",
      dedupeKey: "scan-unhandled-error:TypeError",
    },
    new Date().toISOString(),
  );
  check("payload: detail is redacted on the way out", !leaky.detail.includes("user@example.com"));

  // 4. Customer identity is pseudonymous, stable, and not reversible.
  const ref1 = customerRef("Anthony@Example.com");
  const ref2 = customerRef("anthony@example.com ");
  check("customerRef: never contains the address", !ref1.includes("@") && !ref1.includes("anthony"));
  check("customerRef: stable across case and whitespace", ref1 === ref2);
  check("customerRef: differs between customers", customerRef("other@example.com") !== ref1);
  check("customerRef: is short and prefixed", /^c_[0-9a-f]{16}$/.test(ref1));

  // 5. A failing endpoint is swallowed but counted.
  __resetAlertFailureCount();
  stubEndpoint("throw");
  const threw = await postAlert({ severity: "info", kind: "k", dedupeKey: "k" });
  check("endpoint throwing: does not reject", threw.sent === false && threw.reason === "failed");
  check("endpoint throwing: counted", alertFailureCount() === 1);

  stubEndpoint("http500");
  const rejected = await postAlert({ severity: "info", kind: "k", dedupeKey: "k" });
  check("endpoint 5xx: reported as failed", !rejected.sent);
  check("endpoint 5xx: counted", alertFailureCount() === 2);

  // 6. A hanging endpoint cannot hold a request open.
  __resetAlertFailureCount();
  stubEndpoint("hang");
  const startedAt = Date.now();
  const hung = await postAlert({ severity: "info", kind: "k", dedupeKey: "k" });
  const elapsed = Date.now() - startedAt;
  check("endpoint hanging: gives up", !hung.sent);
  check(`endpoint hanging: within the 2s timeout (took ${elapsed}ms)`, elapsed < 4000);
  check("endpoint hanging: counted", alertFailureCount() === 1);

  globalThis.fetch = realFetch;
  configure(false);

  console.log(
    failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
