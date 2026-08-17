// ──────────────────────────────────────────────────────────────
// HTTP transport posture.
//
// Everything else in the scanner looks at what the target serves over the
// scheme it was asked about. This asks a different question: **what happens
// on port 80?**
//
// It matters because a site can be perfectly configured over HTTPS and still
// serve its whole application over plain HTTP to anyone who types the bare
// domain — which is what most people type. The first request of a session is
// the one that gets intercepted, and until now the scanner could not see it:
// `checkSsl()` only reported a problem when the *target itself* was requested
// over `http:`, so scanning `https://example.com` reported clean transport
// even when `http://example.com` served the site unencrypted.
//
// HSTS is the other half. A redirect fixes the second request; HSTS is what
// fixes the first one, on every visit after the browser has seen the header.
// ──────────────────────────────────────────────────────────────

import { safeFetch } from "./fetcher";
import type { CategoryResult, Finding, ScanContext } from "./types";

/** Chrome's preload list requires at least a year. */
export const HSTS_PRELOAD_MIN_AGE = 31_536_000;
/** Six months — below this, a returning visitor's protection lapses quickly. */
export const HSTS_SHORT_MAX_AGE = 15_552_000;

export interface HttpOriginProbe {
  /** False when nothing answered on port 80 (closed, filtered, or no listener). */
  reachable: boolean;
  status: number;
  /** `Location` header, when the response was a redirect. */
  location?: string;
  /** True when the redirect target is an https:// URL. */
  redirectsToHttps: boolean;
  /** True when the redirect stays on the same hostname. */
  sameHost: boolean;
  /** 301/308 are permanent; 302/303/307 are not. */
  permanent: boolean;
  error?: string;
}

export interface HstsPolicy {
  present: boolean;
  maxAge: number;
  includeSubDomains: boolean;
  preload: boolean;
}

/**
 * Parse a `Strict-Transport-Security` header.
 *
 * Directives are case-insensitive and order-independent, and `max-age` may be
 * quoted. A header we cannot parse is reported as `maxAge: 0`, which reads as
 * "no protection" — the safe direction to be wrong in.
 */
export function parseHsts(value: string | undefined): HstsPolicy {
  if (!value || !value.trim()) {
    return { present: false, maxAge: 0, includeSubDomains: false, preload: false };
  }
  const lower = value.toLowerCase();
  const maxAgeMatch = /max-age\s*=\s*"?(\d+)"?/.exec(lower);
  return {
    present: true,
    maxAge: maxAgeMatch ? Number(maxAgeMatch[1]) : 0,
    includeSubDomains: /(^|[;\s])includesubdomains($|[;\s])/.test(lower),
    preload: /(^|[;\s])preload($|[;\s])/.test(lower),
  };
}

/**
 * Ask port 80 what it does, without following the answer.
 *
 * `redirect: "manual"` is the point of this function — following the redirect
 * would land on the HTTPS site and tell us nothing about whether a redirect
 * happened at all.
 */
export async function probeHttpOrigin(target: URL): Promise<HttpOriginProbe> {
  const httpUrl = new URL(target.toString());
  httpUrl.protocol = "http:";
  // Explicit port 80: if the original URL named a port (e.g. :8443), reusing
  // it would probe a different service rather than the HTTP origin.
  httpUrl.port = "";

  const res = await safeFetch(httpUrl.toString(), { redirect: "manual" });

  if (res.status === 0) {
    return {
      reachable: false,
      status: 0,
      redirectsToHttps: false,
      sameHost: false,
      permanent: false,
      error: res.error,
    };
  }

  const location = res.headers["location"];
  let redirectsToHttps = false;
  let sameHost = false;
  if (location) {
    try {
      const dest = new URL(location, httpUrl);
      redirectsToHttps = dest.protocol === "https:";
      sameHost = dest.hostname.toLowerCase() === target.hostname.toLowerCase();
    } catch {
      /* an unparseable Location is reported as no redirect */
    }
  }

  return {
    reachable: true,
    status: res.status,
    location,
    redirectsToHttps,
    sameHost,
    permanent: res.status === 301 || res.status === 308,
  };
}

/**
 * Grade the transport posture. Pure — the network work happens in
 * `probeHttpOrigin`, so every branch here is testable offline.
 */
export function checkHttpPosture(
  ctx: ScanContext,
  probe: HttpOriginProbe | null,
): CategoryResult {
  const findings: Finding[] = [];
  const servedOverHttps = ctx.target.protocol === "https:";

  // ── The target itself was plain HTTP ────────────────────────────────────
  if (!servedOverHttps) {
    findings.push({
      category: "ssl-tls",
      severity: "high",
      title: "Site not served over HTTPS",
      detail:
        "The target was reachable over plain HTTP. All traffic — including credentials and session cookies — can be read or modified in transit.",
      evidence: `Scheme: ${ctx.target.protocol}`,
      fixPrompt:
        "Serve the site exclusively over HTTPS and redirect all HTTP traffic to HTTPS with a 301. Most hosts (Vercel, Netlify, Cloudflare) provision free certificates automatically.",
    });
  }

  // ── What port 80 actually does ──────────────────────────────────────────
  if (servedOverHttps && probe) {
    if (!probe.reachable) {
      // Nothing listening on 80 is the strongest posture there is: there is
      // no plaintext request to intercept, because there is nothing to talk to.
      findings.push({
        category: "ssl-tls",
        severity: "info",
        title: "No plain-HTTP listener",
        detail:
          "Nothing answered on port 80, so there is no unencrypted entry point to intercept. This is stronger than redirecting.",
        evidence: `http://${ctx.target.hostname} did not respond`,
        fixPrompt:
          "No action needed. Keep port 80 closed, and make sure HSTS is set so browsers never try it.",
      });
    } else if (!probe.location) {
      findings.push({
        category: "ssl-tls",
        severity: "high",
        title: "HTTP serves the site without redirecting to HTTPS",
        detail:
          "Port 80 returned content instead of a redirect. Anyone typing the bare domain gets an unencrypted session, and their first request — often the one carrying a saved credential — is readable on the wire.",
        evidence: `http://${ctx.target.hostname} → HTTP ${probe.status}`,
        fixPrompt:
          "Configure the HTTP listener to return a 301 redirect to the https:// equivalent of every path, then add a Strict-Transport-Security header on the HTTPS responses.",
      });
    } else if (!probe.redirectsToHttps) {
      findings.push({
        category: "ssl-tls",
        severity: "high",
        title: "HTTP redirects somewhere other than HTTPS",
        detail:
          "Port 80 redirects, but not to an https:// URL, so the visitor is still left on an unencrypted connection.",
        evidence: `Location: ${probe.location}`,
        fixPrompt:
          "Point the HTTP redirect at the https:// version of the same host and path.",
      });
    } else {
      if (!probe.sameHost) {
        findings.push({
          category: "ssl-tls",
          severity: "low",
          title: "HTTP redirects to a different host",
          detail:
            "Port 80 redirects to HTTPS on another hostname. That is sometimes deliberate (an apex-to-www redirect), but it costs a round trip and breaks HSTS on the original host.",
          evidence: `Location: ${probe.location}`,
          fixPrompt:
            "Redirect to https:// on the same host first, then to the canonical host, so HSTS applies to both.",
        });
      }
      if (!probe.permanent) {
        findings.push({
          category: "ssl-tls",
          severity: "low",
          title: "HTTP to HTTPS redirect is temporary",
          detail:
            `The redirect uses HTTP ${probe.status}. Browsers do not cache temporary redirects, so every new session starts with an unencrypted request.`,
          evidence: `HTTP ${probe.status} → ${probe.location}`,
          fixPrompt:
            "Change the HTTP to HTTPS redirect from a temporary status to a permanent 301 (or 308 to preserve the request method).",
        });
      }
    }
  }

  // ── HSTS: what protects the *first* request ─────────────────────────────
  if (servedOverHttps) {
    const hsts = parseHsts(ctx.headers["strict-transport-security"]);
    if (!hsts.present) {
      findings.push({
        category: "ssl-tls",
        severity: "medium",
        title: "No HSTS header",
        detail:
          "Strict-Transport-Security is not set. A redirect only protects the second request; without HSTS every fresh visit still begins over plain HTTP, which is where an interception happens.",
        evidence: "Strict-Transport-Security: (absent)",
        fixPrompt:
          "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` to every HTTPS response. Start with a short max-age if you are unsure, confirm nothing breaks, then raise it.",
      });
    } else {
      if (hsts.maxAge === 0) {
        findings.push({
          category: "ssl-tls",
          severity: "medium",
          title: "HSTS is present but disabled",
          detail:
            "The header is sent with a max-age of zero (or an unreadable value), which instructs browsers to forget the policy rather than enforce it.",
          evidence: `Strict-Transport-Security: ${ctx.headers["strict-transport-security"]}`,
          fixPrompt:
            "Set a real max-age — `max-age=31536000; includeSubDomains`. A max-age of 0 is the documented way to switch HSTS off.",
        });
      } else if (hsts.maxAge < HSTS_SHORT_MAX_AGE) {
        findings.push({
          category: "ssl-tls",
          severity: "low",
          title: "HSTS max-age is short",
          detail:
            `max-age is ${hsts.maxAge}s (about ${Math.round(hsts.maxAge / 86400)} days). Protection lapses that long after a visitor's last visit, so infrequent users are unprotected exactly when they return.`,
          evidence: `max-age=${hsts.maxAge}`,
          fixPrompt:
            "Raise Strict-Transport-Security max-age to at least 15552000 (six months); 31536000 (one year) is the usual choice.",
        });
      }
      if (!hsts.includeSubDomains) {
        findings.push({
          category: "ssl-tls",
          severity: "low",
          title: "HSTS does not cover subdomains",
          detail:
            "Without includeSubDomains the policy applies to this hostname only, so a forgotten subdomain over plain HTTP can still be used to set cookies or phish on your domain.",
          evidence: `Strict-Transport-Security: ${ctx.headers["strict-transport-security"]}`,
          fixPrompt:
            "Add `includeSubDomains` to the Strict-Transport-Security header — but confirm first that every subdomain, including internal ones, is served over HTTPS.",
        });
      }
      // Preload is a deliberate, hard-to-reverse commitment, so its absence is
      // information rather than a fault.
      if (!hsts.preload && hsts.maxAge >= HSTS_PRELOAD_MIN_AGE && hsts.includeSubDomains) {
        findings.push({
          category: "ssl-tls",
          severity: "info",
          title: "Eligible for HSTS preload but not preloaded",
          detail:
            "max-age and includeSubDomains already meet the preload requirements. Preloading closes the remaining gap: the very first visit from a browser that has never seen the site.",
          evidence: `max-age=${hsts.maxAge}; includeSubDomains`,
          fixPrompt:
            "Add `preload` to the header and submit the domain at hstspreload.org. Removal takes months, so only do this once every subdomain is permanently HTTPS.",
        });
      }
    }
  }

  // ── Mixed content ───────────────────────────────────────────────────────
  if (servedOverHttps) {
    const mixed = ctx.html.match(/(?:src|href)=["']http:\/\/[^"']+["']/gi);
    if (mixed) {
      findings.push({
        category: "ssl-tls",
        severity: "medium",
        title: "Mixed content (HTTP resources on HTTPS page)",
        detail:
          "The HTTPS page loads resources over plain HTTP. Browsers may block these, and an attacker on the network can tamper with whatever is not blocked.",
        evidence: [...new Set(mixed)].slice(0, 3).join(", "),
        fixPrompt:
          "Update all resource URLs to https://, and add `Content-Security-Policy: upgrade-insecure-requests` so anything missed is upgraded rather than sent in the clear.",
      });
    }
  }

  return {
    id: "ssl-tls",
    label: "Transport Security (HTTPS/HSTS)",
    // `info` findings are observations, not faults — a site with nothing but
    // info findings has passed, and saying otherwise would make a clean result
    // impossible to achieve.
    passed: findings.every((f) => f.severity === "info"),
    findings,
  };
}
