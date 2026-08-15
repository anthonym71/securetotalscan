// ──────────────────────────────────────────────────────────────
// Fixed-window rate limiting.
//
// Uses Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set (durable and
// shared across serverless instances). Falls back to a per-instance in-memory
// window otherwise, so protection is never zero even before Redis is wired up.
// ──────────────────────────────────────────────────────────────

export interface LimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  resetIn: number;
  limit: number;
}

const memory = new Map<string, { count: number; expiresAt: number }>();

function memoryLimit(
  key: string,
  max: number,
  windowSeconds: number,
): LimitResult {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: max - 1, resetIn: windowSeconds, limit: max };
  }
  entry.count += 1;
  const resetIn = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  // Opportunistic cleanup so the map cannot grow without bound.
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
  }
  return {
    ok: entry.count <= max,
    remaining: Math.max(0, max - entry.count),
    resetIn,
    limit: max,
  };
}

async function upstashLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<LimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/pipeline`, {
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
      remaining: Math.max(0, max - count),
      resetIn: ttl > 0 ? ttl : windowSeconds,
      limit: max,
    };
  } catch {
    return null;
  }
}

/** Consume one token from `key`. Never throws; degrades to in-memory. */
export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<LimitResult> {
  const remote = await upstashLimit(`sts:rl:${key}`, max, windowSeconds);
  return remote ?? memoryLimit(key, max, windowSeconds);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
