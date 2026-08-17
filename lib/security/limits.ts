import { NextResponse } from "next/server";
import type { LimitResult } from "@/lib/ratelimit";

/**
 * Response for "we could not apply a trustworthy rate limit". Used when the
 * durable counter store is missing or unreachable in production: we refuse
 * rather than serve the endpoint unmetered.
 */
export function limiterUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error:
        "This service is temporarily unavailable. Please try again in a few minutes.",
    },
    { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
  );
}

/** True when any check could not be applied. */
export function anyUnavailable(results: LimitResult[]): boolean {
  return results.some((result) => !result.available);
}
