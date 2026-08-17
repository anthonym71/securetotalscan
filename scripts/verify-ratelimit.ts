// Offline regression tests for rate limiting.
//
// The rule under test: production must never fall back to a per-instance
// in-memory counter. If the durable store is missing or unreachable, the
// limiter reports `available: false` and callers refuse the request.
//
// Run: npm run verify:ratelimit

import {
  __resetMemoryStore,
  clientIp,
  durableStoreConfigured,
  isProduction,
  rateLimit,
} from "../lib/ratelimit";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

type FetchStub = (input: unknown, init?: unknown) => Promise<Response>;

const realFetch = globalThis.fetch;

function stubRedis(behaviour: "ok" | "error" | "http500" | "flaky") {
  let calls = 0;
  const counters = new Map<string, number>();
  const stub: FetchStub = async (_input, init) => {
    calls += 1;
    if (behaviour === "error") throw new Error("connect ECONNREFUSED");
    if (behaviour === "http500") return new Response("nope", { status: 500 });
    if (behaviour === "flaky" && calls === 1) throw new Error("transient");
    const body = JSON.parse(String((init as { body?: string })?.body ?? "[]"));
    const key = String(body[0][1]);
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return new Response(
      JSON.stringify([{ result: next }, { result: 1 }, { result: 60 }]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  globalThis.fetch = stub as typeof fetch;
  return () => calls;
}

function setEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const DEV = {
  NODE_ENV: "development",
  VERCEL_ENV: undefined,
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
};
const PROD_NO_STORE = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
};
const PROD_WITH_STORE = {
  ...PROD_NO_STORE,
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
};

async function main() {
  console.log("Rate limiting — regression checks\n");

  // 1. Development without a durable store still limits, in memory.
  setEnv(DEV);
  __resetMemoryStore();
  const dev1 = await rateLimit("verify:dev", 2, 60);
  const dev2 = await rateLimit("verify:dev", 2, 60);
  const dev3 = await rateLimit("verify:dev", 2, 60);
  check("dev: first request allowed", dev1.ok && dev1.available);
  check("dev: uses the in-memory store", dev1.store === "memory");
  check("dev: window is enforced", dev2.ok && !dev3.ok);
  check("dev: is not production", !isProduction());

  // 2. Production without a durable store fails closed.
  setEnv(PROD_NO_STORE);
  __resetMemoryStore();
  const prodNone = await rateLimit("verify:prod-none", 100, 60);
  check("prod, no store: reports unavailable", prodNone.available === false);
  check("prod, no store: request is not allowed", prodNone.ok === false);
  check("prod, no store: never uses memory", prodNone.store !== "memory");
  check("prod, no store: durableStoreConfigured() is false", !durableStoreConfigured());

  // 3. Production with a healthy durable store counts in Redis.
  setEnv(PROD_WITH_STORE);
  stubRedis("ok");
  const redis1 = await rateLimit("verify:prod-redis", 2, 60);
  const redis2 = await rateLimit("verify:prod-redis", 2, 60);
  const redis3 = await rateLimit("verify:prod-redis", 2, 60);
  check("prod, redis: available", redis1.available && redis1.store === "redis");
  check("prod, redis: limit enforced", redis1.ok && redis2.ok && !redis3.ok);
  check("prod, redis: reports reset window", redis1.resetIn > 0);

  // 4. Production with an unreachable store fails closed, not open.
  stubRedis("error");
  const down = await rateLimit("verify:prod-down", 100, 60);
  check("prod, redis down: unavailable", down.available === false);
  check("prod, redis down: not allowed", down.ok === false);

  stubRedis("http500");
  const http500 = await rateLimit("verify:prod-500", 100, 60);
  check("prod, redis 5xx: fails closed", !http500.available && !http500.ok);

  // 5. A single transient error is absorbed by the retry.
  stubRedis("flaky");
  const flaky = await rateLimit("verify:prod-flaky", 5, 60);
  check("prod, transient error: retried and served", flaky.available && flaky.ok);

  // 6. Development with an unreachable store may degrade to memory.
  setEnv({ ...PROD_WITH_STORE, NODE_ENV: "development", VERCEL_ENV: "preview" });
  stubRedis("error");
  __resetMemoryStore();
  const preview = await rateLimit("verify:preview", 1, 60);
  check("preview: degrades to memory rather than refusing", preview.available);

  globalThis.fetch = realFetch;

  // 7. Client IP extraction.
  check(
    "clientIp: first hop of x-forwarded-for",
    clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })) === "1.2.3.4",
  );
  check("clientIp: unknown when absent", clientIp(new Headers()) === "unknown");

  console.log(
    failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
