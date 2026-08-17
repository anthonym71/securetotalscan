// ──────────────────────────────────────────────────────────────
// Operational alerting — web tier.
//
// Posts an HMAC-signed JSON alert to an external on-call endpoint
// (docs/ALERTING.md has the wire format and the receiver's obligations).
//
// Three rules govern everything in this file:
//
//   1. An alert must never break a customer request. Every failure path is
//      swallowed, and the send is bounded by a short timeout.
//   2. Swallowing is not the same as ignoring. Failures are counted and
//      logged, because "alerting broke and nothing said so" is the exact
//      blind spot this module exists to close.
//   3. Nothing sensitive leaves the process. No secrets, no tokens, no
//      request bodies, and no raw customer email addresses — see
//      `customerRef()`.
//
// Serverless note: on Vercel a promise that is not awaited may never run,
// because the function can freeze the moment the response is returned. Route
// handlers therefore schedule alerts with `after()` from `next/server`, which
// keeps the invocation alive until the send settles. Do not replace those
// calls with a bare `void postAlert(...)`.
// ──────────────────────────────────────────────────────────────

import { createHmac } from "node:crypto";

/**
 * Only `critical` wakes a human. Reserve it for money broken, scanner down,
 * or deep-scan agents erroring — everything else is logged and reviewed.
 */
export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertInput {
  severity: AlertSeverity;
  /** Stable machine label for the condition, e.g. `"scan-unhandled-error"`. */
  kind: string;
  /** Hostname the condition relates to, when there is one. */
  site?: string;
  /** Pseudonymous customer reference. Use `customerRef()`; never an address. */
  customer?: string;
  /** One line of human context. Truncated and redacted before sending. */
  detail?: string;
  /**
   * Stable for the condition, so the receiver can suppress repeats. It must
   * not contain a timestamp, a session id, or anything else that changes on
   * every occurrence — a key that varies per event defeats suppression and
   * turns a flapping check into continuous paging.
   */
  dedupeKey: string;
}

export interface AlertPayload {
  severity: AlertSeverity;
  kind: string;
  site: string;
  customer: string;
  detail: string;
  occurred_at: string;
  dedupe_key: string;
  source: string;
}

export type AlertOutcome =
  | { sent: true }
  | { sent: false; reason: "not-configured" | "failed" };

const TIMEOUT_MS = 2000;
const MAX_DETAIL_CHARS = 500;

/** Signature header, `sha256=<hex>` over the exact request body. */
export const SIGNATURE_HEADER = "x-sts-signature";
/** Send time as epoch seconds, so a stale replay is detectable. */
export const TIMESTAMP_HEADER = "x-sts-timestamp";

/**
 * Count of sends this instance could not complete. Exposed so a future health
 * surface can report it; logged on every failure in the meantime.
 */
let failureCount = 0;

export function alertFailureCount(): number {
  return failureCount;
}

/** Test seam. */
export function __resetAlertFailureCount(): void {
  failureCount = 0;
}

export function alertingConfigured(): boolean {
  return Boolean(process.env.ALERT_WEBHOOK_URL && process.env.ALERT_WEBHOOK_SECRET);
}

// Values that look like credentials, stripped before anything is sent. The
// list is deliberately blunt: over-redacting an alert costs a little context,
// under-redacting one posts a secret to a third party.
const SECRET_PATTERNS: RegExp[] = [
  /\b(?:bearer|basic)\s+[\w\-._~+/]+=*/gi,
  /\b(?:sk|pk|rk|whsec|xoxb|xoxp|ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_\-]{8,}/g,
  /\b[A-Za-z0-9_\-]*(?:secret|token|password|passwd|apikey|api_key)[A-Za-z0-9_\-]*\s*[=:]\s*\S+/gi,
  // JWTs.
  /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
  // Bare email addresses — customer identity travels as customerRef() only.
  /\b[^@\s]+@[^@\s]+\.[^@\s]{2,}\b/g,
];

/**
 * Strip credential-shaped substrings and email addresses, then truncate.
 *
 * This is a backstop, not a licence to pass raw exception text through. Call
 * sites should send a short description they wrote themselves.
 */
export function redact(detail: string): string {
  let out = detail;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  out = out.replace(/\s+/g, " ").trim();
  return out.length > MAX_DETAIL_CHARS ? `${out.slice(0, MAX_DETAIL_CHARS - 1)}…` : out;
}

/**
 * Pseudonymous, stable reference for a customer.
 *
 * The payload's `customer` field must never carry a raw email address. The
 * alert endpoint is operated by a third party, and until Anthony has confirmed
 * that endpoint in writing (docs/PR-PLAN.md §"Operational alerting" —
 * outstanding confirmation), sending addresses there would be an unreviewed
 * disclosure of customer data. A keyed digest still lets the receiver see that
 * twenty alerts concern one account without learning who that account is.
 *
 * Returns an empty string when alerting is unconfigured, so nothing derived
 * from a customer address is computed on a machine that cannot alert anyway.
 */
export function customerRef(email: string): string {
  const secret = process.env.ALERT_WEBHOOK_SECRET;
  if (!secret || !email) return "";
  const digest = createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
  return `c_${digest.slice(0, 16)}`;
}

export function signPayload(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function buildPayload(input: AlertInput, occurredAt: string): AlertPayload {
  return {
    severity: input.severity,
    kind: input.kind,
    site: input.site ? redact(input.site) : "",
    customer: input.customer ?? "",
    detail: input.detail ? redact(input.detail) : "",
    occurred_at: occurredAt,
    dedupe_key: input.dedupeKey,
    source: "web",
  };
}

/**
 * Send one alert. Never throws and never rejects.
 *
 * Returns an outcome rather than nothing so callers under test can assert on
 * it; production callers ignore the result and simply schedule the send.
 */
export async function postAlert(input: AlertInput): Promise<AlertOutcome> {
  const url = process.env.ALERT_WEBHOOK_URL;
  const secret = process.env.ALERT_WEBHOOK_SECRET;

  // Unconfigured is the normal state locally and in CI. Stay silent — a
  // console line per scan in development is noise, not signal.
  if (!url || !secret) return { sent: false, reason: "not-configured" };

  try {
    const body = JSON.stringify(buildPayload(input, new Date().toISOString()));
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNATURE_HEADER]: signPayload(body, secret),
        [TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      failureCount += 1;
      console.error(
        `alert: endpoint returned ${res.status} for kind=${input.kind} ` +
          `(${failureCount} failed send(s) on this instance)`,
      );
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (err) {
    failureCount += 1;
    // The error is logged, not alerted on — alerting about alerting failing
    // needs a path that is already broken.
    console.error(
      `alert: send failed for kind=${input.kind} ` +
        `(${failureCount} failed send(s) on this instance):`,
      err instanceof Error ? err.message : err,
    );
    return { sent: false, reason: "failed" };
  }
}
