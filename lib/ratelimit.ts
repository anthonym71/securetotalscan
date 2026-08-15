// ──────────────────────────────────────────────────────────────
// Fixed-window rate limiting.
//
// Production must use a durable, shared store (Upstash Redis), because each
// serverless instance has its own memory and a per-instance counter is trivial
// to bypass by simply sending more concurrent requests.
//
// Behaviour:
//   * Durable store configured and healthy  → counted in Redis.
//   * Production without a durable store    → FAIL CLOSED (`available: false`).
//   * Production with a store that errors   → one retry, then FAIL CLOSED.
//   * Development / preview                 → in-memory window, clearly marked.
//
// Callers must treat `available: false` as "refuse the request", not "allow".
// ──────────────────────────────────────────────────────────────

export type LimitStore = "redis" | "memory" | "none";

export interface LimitResult {
  /** False when the caller has exhausted the window. */
  ok: boolean;
  /**
   * False when no trustworthy counter could be applied. Callers must refuse
   * the request (503) rather than serving it unlimited.
   */
  available: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  resetIn: number;
  limit: number;
  store: LimitStore;
}

const memory = new Map<string, { count: number; expiresAt: number }>();

/** True on Vercel production, or any deployment running with NODE_ENV=production. */
export function isProduction(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

/** True when a shared, durable counter store is configured. */
export function durableStoreConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

function memoryLimit(key: string, max: number, windowSeconds: number): LimitResult {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return {
      ok: true,
      available: true,
      remaining: max - 1,
      resetIn: windowSeconds,
      limit: max,
      store: "memory",
    };
  }
  entry.count += 1;
  const resetIn = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  // Opportunistic cleanup so the map cannot grow without bound.
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
  }
  return {
    ok: entry.count <= max,
    available: true,
    remaining: Math.max(0, max - entry.count),
    resetIn,
    limit: max,
    store: "memory",
  };
}

async function upstashOnce(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<LimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSeconds), "NX"],
        ["TTL", key],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: number }[];
    const count = Number(data?.[0]?.result ?? 0);
    const ttl = Number(data?.[2]?.result ?? windowSeconds);
    if (!count) return null;
    return {
      ok: count <= max,
      available: true,
      remaining: Math.max(0, max - count),
      resetIn: ttl > 0 ? ttl : windowSeconds,
      limit: max,
      store: "redis",
    };
  } catch {
    return null;
  }
}

function unavailable(max: number, windowSeconds: number): LimitResult {
  return {
    ok: false,
    available: false,
    remaining: 0,
    resetIn: Math.min(windowSeconds, 60),
    limit: max,
    store: "none",
  };
}

/**
 * Consume one token from `key`.
 *
 * Never throws. In production it never silently degrades to a per-instance
 * counter: if the durable store is missing or unreachable the result is
 * `available: false` and the caller must refuse the request.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<LimitResult> {
  const namespaced = `sts:rl:${key}`;

  if (durableStoreConfigured()) {
    const first = await upstashOnce(namespaced, max, windowSeconds);
    if (first) return first;
    // One retry absorbs a transient blip before we start refusing traffic.
    const second = await upstashOnce(namespaced, max, windowSeconds);
    if (second) return second;
    if (isProduction()) {
      console.error("rate limit: durable store unreachable — failing closed.");
      return unavailable(max, windowSeconds);
    }
    return memoryLimit(key, max, windowSeconds);
  }

  if (isProduction()) {
    console.error(
      "rate limit: no durable store configured in production — failing closed. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
    return unavailable(max, windowSeconds);
  }

  return memoryLimit(key, max, windowSeconds);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Test seam: clear the in-memory windows. */
export function __resetMemoryStore(): void {
  memory.clear();
}
