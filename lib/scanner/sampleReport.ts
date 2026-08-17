// ──────────────────────────────────────────────────────────────
// The sample report shown on the marketing site and offered as a PDF download.
//
// It is a real, plausible scan of a fictional store ("acme-storefront"), not a
// real customer's site. Its whole purpose is to let a prospect see exactly what
// a free scan returns — the findings in full, one fix prompt unlocked as a
// sample, and the rest held back — before they decide to buy.
//
// **Why the internal fixture is not exported.** The full report below carries a
// `fixPrompt` on every finding: that is the paid product. This module exports
// only `sampleFreeReport()`, which runs the same `toPublicReport()` the live
// paywall uses, at the "free" entitlement. So the only thing any caller — a
// server component, the download route — can obtain is the redacted public
// report a free visitor would get. The prompts never leave this file except the
// single sampled one the paywall itself chooses to reveal. Import this only from
// server code; never from a "use client" component.
// ──────────────────────────────────────────────────────────────

import { toPublicReport } from "./publicReport";
import type { PublicScanReport, ScanReport } from "./types";

// Ordered so the first medium-severity finding — the one the free tier samples —
// is the X-Content-Type-Options header, a fix a non-technical owner can actually
// action. `sampledFindings()` walks categories in this order, so this order is
// load-bearing, not cosmetic.
const SAMPLE_SCAN: ScanReport = {
  url: "https://acme-storefront.vercel.app/",
  scannedAt: "2026-08-17T12:41:00.000Z",
  durationMs: 5100,
  grade: "D",
  score: 47,
  summary: { critical: 1, high: 2, medium: 2, low: 1, info: 1, total: 7 },
  categories: [
    {
      id: "secrets",
      label: "Secrets & credentials",
      passed: false,
      findings: [
        {
          category: "secrets",
          severity: "critical",
          title: "Stripe secret key in the client bundle",
          detail:
            "A live Stripe secret key was found in JavaScript served to the browser. Anyone loading the page can read it and charge or refund on your account.",
          evidence: "/_next/static/chunks/main-4f2a.js: sk_live_51Nx...",
          fixPrompt:
            "Remove the hardcoded Stripe secret key from all client-side code. Move it to a server-side environment variable and proxy any calls that need it through a backend API route. Then rotate the key immediately - it must be treated as compromised.",
        },
      ],
    },
    {
      id: "headers",
      label: "Security headers",
      passed: false,
      findings: [
        {
          category: "headers",
          severity: "high",
          title: "No Content-Security-Policy header",
          detail:
            "The application returns no CSP header, so a single injected script can run with full access to the page, its cookies and its storage.",
          fixPrompt:
            "Add a Content-Security-Policy header starting with default-src 'self'. Enumerate the third-party origins the app genuinely needs and add only those.",
        },
        {
          category: "headers",
          severity: "medium",
          title: "X-Content-Type-Options is not set",
          detail:
            "Without nosniff, a browser may interpret an uploaded file as a script based on its contents rather than its declared type.",
          fixPrompt:
            "Set X-Content-Type-Options: nosniff on every response. In Next.js add it to the headers() block in next.config.mjs so it applies to all routes.",
        },
      ],
    },
    {
      id: "ssl-tls",
      label: "Transport security",
      passed: false,
      findings: [
        {
          category: "ssl-tls",
          severity: "high",
          title: "HTTP serves content without redirecting to HTTPS",
          detail:
            "Requesting the http:// origin returned the application rather than a redirect. The bare domain is what people type, so this is usually the first request of a session - the one carrying a saved credential.",
          evidence: "http://acme-storefront.vercel.app/ -> 200 OK",
          fixPrompt:
            "Redirect all HTTP traffic to HTTPS with a 301 before any content is served, then add Strict-Transport-Security with max-age=31536000 and includeSubDomains.",
        },
        {
          category: "ssl-tls",
          severity: "medium",
          title: "Strict-Transport-Security is missing",
          detail:
            "Without HSTS a browser will try HTTP first on a fresh visit, leaving a window for interception.",
          fixPrompt:
            "Add Strict-Transport-Security: max-age=31536000; includeSubDomains. Consider preload once you are confident every subdomain serves HTTPS.",
        },
        {
          category: "ssl-tls",
          severity: "info",
          title: "Port 80 is closed",
          detail:
            "Nothing is listening on the plaintext port, which is the strongest posture: there is no unencrypted entry point to intercept.",
          // A positive finding carries no fix prompt, so it is never locked and
          // never counted as withheld.
          fixPrompt: "",
        },
      ],
    },
    {
      id: "debug-artifacts",
      label: "Debug artifacts",
      passed: false,
      findings: [
        {
          category: "debug-artifacts",
          severity: "low",
          title: "Source map published in production",
          detail:
            "A .map file is reachable, which reproduces your original source including comments.",
          evidence: "/_next/static/chunks/main-4f2a.js.map",
          fixPrompt:
            "Disable production source maps, or restrict them to authenticated internal access. In Next.js set productionBrowserSourceMaps to false.",
        },
      ],
    },
  ],
  notes: [
    "robots.txt was unreachable (timed out after 5s)",
    "Dependency scanning needs a repository connection and was not part of this surface scan.",
  ],
};

/**
 * The sample as a free visitor would receive it: one sampled prompt, the rest
 * withheld. This is the only export — the internal report with every prompt
 * stays private to this module.
 */
export function sampleFreeReport(): PublicScanReport {
  return toPublicReport(SAMPLE_SCAN, { entitlement: "free" });
}
