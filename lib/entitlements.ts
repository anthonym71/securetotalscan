// ──────────────────────────────────────────────────────────────
// What a given request is entitled to see.
//
// Today there are two answers, because today there are two kinds of visitor:
// someone holding a valid session cookie, and everyone else. Phase 3 replaces
// the shared access codes with real per-customer accounts and this module gains
// tiers; the *shape* is chosen now so that every call site already asks "what
// is this request entitled to?" rather than "is there a cookie?".
//
// One deliberate limitation, stated because it is easy to mistake this for more
// than it is: a `member` today holds a shared access code, not an account. It
// proves someone paid; it does not prove *which* customer they are, so it
// cannot yet answer "is this your scan?". Ownership binding lands with accounts
// in PR 3.1 and with the webhook grant in PR 2.6. Until then any member can
// read any scan's prompts, which is acceptable only because every member has
// already paid for prompts.
// ──────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./auth/session";

export type Entitlement = "free" | "member";

/**
 * How many fix prompts a free visitor receives.
 *
 * One, and one only. Zero would make the free scan a list of problems with no
 * demonstration that we can solve any of them — which is a worse product and a
 * worse sales pitch. More than one and the sample becomes the product.
 */
export const FREE_PROMPT_SAMPLES = 1;

/**
 * The severity whose prompt is sampled for free visitors.
 *
 * Medium, per the plan. A critical finding's prompt is the most valuable thing
 * we hold and giving it away undercuts the sale; an `info` prompt demonstrates
 * nothing. Medium shows real, specific, actionable output on a real problem the
 * visitor actually has.
 *
 * Known edge, deliberately not papered over: a report with no medium-severity
 * finding shows **no** sample at all. Falling back to the next severity would
 * mean the reports with the worst problems — all critical, no medium — hand out
 * the most valuable prompt we have. Nine of the scanner's checks emit medium and
 * one of them is a commonly-missing security header, so this is rare rather than
 * theoretical; if measurement in Phase 4 shows otherwise, the fix is to widen
 * the sample downward (low, then info), never upward.
 */
export const SAMPLE_SEVERITY = "medium" as const;

/** Resolve what this request may see. Never throws. */
export async function entitlementFor(req: NextRequest): Promise<Entitlement> {
  try {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    return session ? "member" : "free";
  } catch {
    // A malformed or unverifiable cookie is not a member. Failing closed here
    // is the whole point: an error in session verification must never be the
    // thing that opens the paywall.
    return "free";
  }
}
