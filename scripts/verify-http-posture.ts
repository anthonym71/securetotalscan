// Offline regression tests for HTTP transport posture.
//
// The bug this check exists to close: `checkSsl()` only reported a problem
// when the *target itself* was requested over `http:`. So scanning
// `https://example.com` reported clean transport even when
// `http://example.com` served the entire application unencrypted — and the
// bare domain is what people actually type, so that unencrypted request is
// usually the first one of the session.
//
// Every branch here is pure. The network call lives in `probeHttpOrigin`, so
// these run with no target and no egress.
//
// Run: npm run verify:http-posture

import {
  HSTS_PRELOAD_MIN_AGE,
  checkHttpPosture,
  parseHsts,
  type HttpOriginProbe,
} from "../lib/scanner/httpPosture";
import type { ScanContext } from "../lib/scanner/types";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

function context(overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    target: new URL("https://example.test"),
    finalUrl: "https://example.test",
    status: 200,
    headers: {},
    html: "<html><body></body></html>",
    scriptUrls: [],
    bundleSource: "",
    notes: [],
    ...overrides,
  };
}

const PROBE: Record<string, HttpOriginProbe> = {
  closed: {
    reachable: false,
    status: 0,
    redirectsToHttps: false,
    sameHost: false,
    permanent: false,
  },
  servesContent: {
    reachable: true,
    status: 200,
    redirectsToHttps: false,
    sameHost: false,
    permanent: false,
  },
  permanentRedirect: {
    reachable: true,
    status: 301,
    location: "https://example.test/",
    redirectsToHttps: true,
    sameHost: true,
    permanent: true,
  },
  temporaryRedirect: {
    reachable: true,
    status: 302,
    location: "https://example.test/",
    redirectsToHttps: true,
    sameHost: true,
    permanent: false,
  },
  redirectToHttp: {
    reachable: true,
    status: 301,
    location: "http://other.test/",
    redirectsToHttps: false,
    sameHost: false,
    permanent: true,
  },
  crossHost: {
    reachable: true,
    status: 301,
    location: "https://www.example.test/",
    redirectsToHttps: true,
    sameHost: false,
    permanent: true,
  },
};

const GOOD_HSTS = "max-age=31536000; includeSubDomains; preload";

function titles(ctx: ScanContext, probe: HttpOriginProbe | null): string[] {
  return checkHttpPosture(ctx, probe).findings.map((f) => f.title);
}

function severityOf(ctx: ScanContext, probe: HttpOriginProbe | null, title: string) {
  return checkHttpPosture(ctx, probe).findings.find((f) => f.title === title)?.severity;
}

console.log("HTTP transport posture — regression checks\n");

// ── 1. The bug that motivated this check ─────────────────────────────────

console.log("The gap this closes — HTTPS target, plaintext site on port 80:");
{
  const ctx = context({ headers: { "strict-transport-security": GOOD_HSTS } });
  const found = titles(ctx, PROBE.servesContent);
  check(
    "port 80 serving content is reported",
    found.includes("HTTP serves the site without redirecting to HTTPS"),
  );
  check(
    "and it is high severity",
    severityOf(ctx, PROBE.servesContent, "HTTP serves the site without redirecting to HTTPS") ===
      "high",
  );
  check("the category does not pass", !checkHttpPosture(ctx, PROBE.servesContent).passed);
}

// ── 2. Redirect quality ──────────────────────────────────────────────────

console.log("\nRedirect quality:");
{
  const ctx = context({ headers: { "strict-transport-security": GOOD_HSTS } });
  check(
    "a permanent same-host redirect is clean",
    titles(ctx, PROBE.permanentRedirect).length === 0,
  );
  check(
    "a temporary redirect is flagged",
    titles(ctx, PROBE.temporaryRedirect).includes("HTTP to HTTPS redirect is temporary"),
  );
  check(
    "a redirect that stays on http is flagged high",
    severityOf(ctx, PROBE.redirectToHttp, "HTTP redirects somewhere other than HTTPS") === "high",
  );
  check(
    "a cross-host redirect is noted but only low",
    severityOf(ctx, PROBE.crossHost, "HTTP redirects to a different host") === "low",
  );
}

// ── 3. Port 80 closed is the strongest posture ───────────────────────────

console.log("\nA closed port 80 is a pass, not a failure:");
{
  const ctx = context({ headers: { "strict-transport-security": GOOD_HSTS } });
  const result = checkHttpPosture(ctx, PROBE.closed);
  check("it is reported", result.findings.some((f) => f.title === "No plain-HTTP listener"));
  check("as info, not a fault", severityOf(ctx, PROBE.closed, "No plain-HTTP listener") === "info");
  // A site cannot reach a clean result if merely telling it something counts
  // as a failure.
  check("and the category still passes", result.passed);
}

// ── 4. HSTS parsing ──────────────────────────────────────────────────────

console.log("\nHSTS parsing:");
check("absent header", parseHsts(undefined).present === false);
check("empty header", parseHsts("   ").present === false);
check("max-age is read", parseHsts("max-age=31536000").maxAge === 31536000);
check("quoted max-age is read", parseHsts('max-age="31536000"').maxAge === 31536000);
check("spaces around = are tolerated", parseHsts("max-age = 600").maxAge === 600);
check(
  "directives are case-insensitive",
  parseHsts("MAX-AGE=31536000; IncludeSubDomains; PRELOAD").includeSubDomains &&
    parseHsts("MAX-AGE=31536000; IncludeSubDomains; PRELOAD").preload,
);
check(
  "order does not matter",
  parseHsts("preload; includeSubDomains; max-age=31536000").maxAge === 31536000,
);
check("includeSubDomains absent is detected", !parseHsts("max-age=100").includeSubDomains);
check(
  "a header with no max-age reads as zero, not as protection",
  parseHsts("includeSubDomains").maxAge === 0,
);
// "includeSubDomainsFoo" must not match "includeSubDomains".
check(
  "a lookalike directive does not count",
  !parseHsts("max-age=100; includeSubDomainsExtra").includeSubDomains,
);

// ── 5. HSTS findings ─────────────────────────────────────────────────────

console.log("\nHSTS findings:");
{
  const none = context();
  check("a missing header is medium", severityOf(none, PROBE.permanentRedirect, "No HSTS header") === "medium");

  const zero = context({ headers: { "strict-transport-security": "max-age=0" } });
  check(
    "max-age=0 is reported as disabled, not as present",
    titles(zero, PROBE.permanentRedirect).includes("HSTS is present but disabled"),
  );

  const short = context({ headers: { "strict-transport-security": "max-age=86400" } });
  check(
    "a short max-age is flagged",
    titles(short, PROBE.permanentRedirect).includes("HSTS max-age is short"),
  );

  const noSub = context({ headers: { "strict-transport-security": "max-age=31536000" } });
  check(
    "missing includeSubDomains is flagged",
    titles(noSub, PROBE.permanentRedirect).includes("HSTS does not cover subdomains"),
  );

  const eligible = context({
    headers: { "strict-transport-security": `max-age=${HSTS_PRELOAD_MIN_AGE}; includeSubDomains` },
  });
  check(
    "preload eligibility is surfaced as info",
    severityOf(eligible, PROBE.permanentRedirect, "Eligible for HSTS preload but not preloaded") ===
      "info",
  );

  const full = context({ headers: { "strict-transport-security": GOOD_HSTS } });
  check("a fully configured header produces nothing", titles(full, PROBE.permanentRedirect).length === 0);

  // Preload is a months-to-reverse commitment; nagging a site that has not
  // met the prerequisites would be advice we should not be giving.
  const notEligible = context({ headers: { "strict-transport-security": "max-age=600" } });
  check(
    "preload is not suggested to a site that is not eligible",
    !titles(notEligible, PROBE.permanentRedirect).includes(
      "Eligible for HSTS preload but not preloaded",
    ),
  );
}

// ── 6. Plain-HTTP targets ────────────────────────────────────────────────

console.log("\nAn http:// target:");
{
  const ctx = context({
    target: new URL("http://example.test"),
    finalUrl: "http://example.test",
  });
  const found = titles(ctx, null);
  check("is reported as not served over HTTPS", found.includes("Site not served over HTTPS"));
  check("is not also asked for HSTS", !found.includes("No HSTS header"));
  check("is not probed for mixed content", !found.some((t) => t.includes("Mixed content")));
}

// ── 7. Mixed content ─────────────────────────────────────────────────────

console.log("\nMixed content:");
{
  const ctx = context({
    headers: { "strict-transport-security": GOOD_HSTS },
    html: `<img src="http://cdn.test/logo.png"><a href="http://cdn.test/x">x</a>`,
  });
  check(
    "http subresources on an https page are reported",
    titles(ctx, PROBE.permanentRedirect).includes("Mixed content (HTTP resources on HTTPS page)"),
  );
  const clean = context({
    headers: { "strict-transport-security": GOOD_HSTS },
    html: `<img src="https://cdn.test/logo.png">`,
  });
  check(
    "https subresources are not",
    !titles(clean, PROBE.permanentRedirect).some((t) => t.includes("Mixed content")),
  );
}

// ── 8. Every finding is actionable ───────────────────────────────────────

console.log("\nEvery finding carries a fix prompt:");
{
  const scenarios: [string, ScanContext, HttpOriginProbe | null][] = [
    ["plaintext site", context(), PROBE.servesContent],
    ["temporary redirect", context(), PROBE.temporaryRedirect],
    ["cross-host", context(), PROBE.crossHost],
    ["closed port", context(), PROBE.closed],
    ["http target", context({ target: new URL("http://example.test") }), null],
  ];
  for (const [name, ctx, probe] of scenarios) {
    const all = checkHttpPosture(ctx, probe).findings;
    check(
      `${name}: all ${all.length} finding(s) have detail and a fix prompt`,
      all.every((f) => f.detail.length > 20 && f.fixPrompt.length > 20),
    );
  }
}

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
