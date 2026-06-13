import type { CategoryResult, Finding, ScanContext } from "./types";

/* ───────────────────────── Security Headers ───────────────────────── */

const REQUIRED_HEADERS: {
  name: string;
  severity: Finding["severity"];
  why: string;
  fix: string;
}[] = [
  {
    name: "content-security-policy",
    severity: "high",
    why: "No Content-Security-Policy. CSP is the primary defense against XSS and data injection.",
    fix: "Add a Content-Security-Policy header. Start with a report-only policy like \"default-src 'self'\" and tighten script-src, then enforce it.",
  },
  {
    name: "strict-transport-security",
    severity: "medium",
    why: "No HSTS. Browsers may connect over plain HTTP, exposing traffic to downgrade attacks.",
    fix: "Add \"Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\" so browsers always use HTTPS.",
  },
  {
    name: "x-frame-options",
    severity: "medium",
    why: "No X-Frame-Options / frame-ancestors. The app can be embedded in an iframe and clickjacked.",
    fix: "Add \"X-Frame-Options: DENY\" (or a CSP frame-ancestors 'none' directive) to prevent clickjacking.",
  },
  {
    name: "x-content-type-options",
    severity: "low",
    why: "No X-Content-Type-Options. Browsers may MIME-sniff responses into executable content.",
    fix: "Add \"X-Content-Type-Options: nosniff\".",
  },
  {
    name: "referrer-policy",
    severity: "low",
    why: "No Referrer-Policy. Full URLs (which may contain tokens) can leak to third parties.",
    fix: "Add \"Referrer-Policy: strict-origin-when-cross-origin\".",
  },
];

export function checkHeaders(ctx: ScanContext): CategoryResult {
  const findings: Finding[] = [];
  for (const h of REQUIRED_HEADERS) {
    if (!ctx.headers[h.name]) {
      findings.push({
        category: "headers",
        severity: h.severity,
        title: `Missing ${h.name}`,
        detail: h.why,
        evidence: `Response from ${ctx.finalUrl} did not include "${h.name}".`,
        fixPrompt: `${h.fix} Apply it to every response (configure it in your framework's headers config or your host's response headers).`,
      });
    }
  }
  return {
    id: "headers",
    label: "Security Headers",
    passed: findings.length === 0,
    findings,
  };
}

/* ───────────────────────────── CORS ───────────────────────────── */

export function checkCors(ctx: ScanContext): CategoryResult {
  const findings: Finding[] = [];
  const acao = ctx.headers["access-control-allow-origin"];
  const acac = ctx.headers["access-control-allow-credentials"];

  if (acao === "*") {
    const withCreds = acac === "true";
    findings.push({
      category: "cors",
      severity: withCreds ? "critical" : "medium",
      title: withCreds
        ? "Wildcard CORS with credentials"
        : "Wildcard CORS policy",
      detail: withCreds
        ? "Access-Control-Allow-Origin is '*' together with Allow-Credentials: true. Any website can make authenticated requests to your API on behalf of your users."
        : "Access-Control-Allow-Origin is '*'. Any domain can read responses from your API.",
      evidence: `access-control-allow-origin: *${withCreds ? " + access-control-allow-credentials: true" : ""}`,
      fixPrompt:
        "Replace the wildcard CORS origin with an explicit allowlist of the exact domains that should access your API. Never combine a wildcard origin with credentials; echo back only trusted origins.",
    });
  }
  return {
    id: "cors",
    label: "CORS Misconfigurations",
    passed: findings.length === 0,
    findings,
  };
}

/* ─────────────────────── Information Disclosure ─────────────────────── */

export function checkInfoDisclosure(ctx: ScanContext): CategoryResult {
  const findings: Finding[] = [];

  const poweredBy = ctx.headers["x-powered-by"];
  if (poweredBy) {
    findings.push({
      category: "info-disclosure",
      severity: "low",
      title: "Technology disclosure via X-Powered-By",
      detail: `The server advertises its stack ("${poweredBy}"), helping attackers target known CVEs.`,
      evidence: `x-powered-by: ${poweredBy}`,
      fixPrompt:
        "Remove the X-Powered-By header (e.g. in Next.js set poweredByHeader: false; in Express call app.disable('x-powered-by')).",
    });
  }

  const server = ctx.headers["server"];
  if (server && /\d/.test(server)) {
    findings.push({
      category: "info-disclosure",
      severity: "info",
      title: "Server version disclosed",
      detail: `The Server header reveals a specific version ("${server}").`,
      evidence: `server: ${server}`,
      fixPrompt:
        "Configure your web server / host to suppress or genericize the Server header so it does not reveal exact versions.",
    });
  }

  // Verbose stack traces / framework error pages leaking in the HTML.
  const stackSignals =
    /(at\s+\w+\s+\(.*:\d+:\d+\))|(Traceback \(most recent call last\))|(java\.lang\.\w+Exception)|(System\.\w+Exception)/;
  if (stackSignals.test(ctx.html)) {
    findings.push({
      category: "info-disclosure",
      severity: "medium",
      title: "Stack trace exposed in response",
      detail:
        "The page body contains what looks like a server stack trace, leaking file paths and implementation details.",
      evidence: "Stack-trace pattern detected in HTML response.",
      fixPrompt:
        "Disable verbose error output in production. Return generic error pages to users and log full details server-side only.",
    });
  }

  return {
    id: "info-disclosure",
    label: "Information Disclosure",
    passed: findings.length === 0,
    findings,
  };
}

/* ─────────────────────── Debug & Dev Artifacts ─────────────────────── */

export function checkDebugArtifacts(ctx: ScanContext): CategoryResult {
  const findings: Finding[] = [];
  const src = ctx.bundleSource + ctx.html;

  const localhost = src.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/gi);
  if (localhost) {
    findings.push({
      category: "debug-artifacts",
      severity: "medium",
      title: "Localhost / dev URL in production bundle",
      detail:
        "Hardcoded localhost or 127.0.0.1 URLs were shipped to production, indicating dev config leaked into the build.",
      evidence: [...new Set(localhost)].slice(0, 3).join(", "),
      fixPrompt:
        "Replace hardcoded localhost URLs with environment-based configuration so production uses production endpoints. Verify your build uses production env files.",
    });
  }

  const sourcemap = ctx.scriptUrls.some((u) => u.endsWith(".map"));
  const sourcemapRef = /\/\/[#@]\s*sourceMappingURL=.+\.map/.test(ctx.bundleSource);
  if (sourcemap || sourcemapRef) {
    findings.push({
      category: "debug-artifacts",
      severity: "low",
      title: "Source maps exposed in production",
      detail:
        "Publicly accessible .map files let anyone reconstruct your original source code and comments.",
      evidence: "sourceMappingURL reference found in bundle.",
      fixPrompt:
        "Disable production source maps, or restrict access to .map files so original source is not downloadable by the public.",
    });
  }

  const consoleCount = (ctx.bundleSource.match(/console\.(log|debug|info)\(/g) ?? [])
    .length;
  if (consoleCount > 20) {
    findings.push({
      category: "debug-artifacts",
      severity: "info",
      title: "Debug logging left in production",
      detail: `Found ~${consoleCount} console logging calls in the production bundle, which can leak data and clutter the console.`,
      evidence: `${consoleCount} console.* calls in shipped JS.`,
      fixPrompt:
        "Strip console statements from production builds (e.g. with a bundler plugin like drop_console / babel-plugin-transform-remove-console).",
    });
  }

  return {
    id: "debug-artifacts",
    label: "Debug & Dev Artifacts",
    passed: findings.length === 0,
    findings,
  };
}

/* ─────────────────────────── SSL / TLS ─────────────────────────── */

export function checkSsl(ctx: ScanContext): CategoryResult {
  const findings: Finding[] = [];

  if (ctx.target.protocol !== "https:") {
    findings.push({
      category: "ssl-tls",
      severity: "high",
      title: "Site not served over HTTPS",
      detail:
        "The target was reachable over plain HTTP. All traffic — including credentials — can be intercepted.",
      evidence: `Scheme: ${ctx.target.protocol}`,
      fixPrompt:
        "Serve the site exclusively over HTTPS and redirect all HTTP traffic to HTTPS. Most hosts (Vercel, Netlify) provision free certificates automatically.",
    });
  }

  // Mixed content: HTTPS page referencing http:// resources.
  if (ctx.target.protocol === "https:") {
    const mixed = ctx.html.match(/(?:src|href)=["']http:\/\/[^"']+["']/gi);
    if (mixed) {
      findings.push({
        category: "ssl-tls",
        severity: "medium",
        title: "Mixed content (HTTP resources on HTTPS page)",
        detail:
          "The HTTPS page loads resources over plain HTTP. Browsers may block these or attackers may tamper with them.",
        evidence: [...new Set(mixed)].slice(0, 3).join(", "),
        fixPrompt:
          "Update all resource URLs to use https:// (or protocol-relative // ) so the page has no insecure subresources.",
      });
    }
  }

  return {
    id: "ssl-tls",
    label: "SSL/TLS Issues",
    passed: findings.length === 0,
    findings,
  };
}

/* ─────────────────────── Input Validation (heuristic) ─────────────────────── */

export function checkInputValidation(ctx: ScanContext): CategoryResult {
  const findings: Finding[] = [];

  // dangerouslySetInnerHTML / innerHTML with concatenation are classic XSS sinks.
  const dangerous =
    /dangerouslySetInnerHTML/.test(ctx.bundleSource) ||
    /\.innerHTML\s*=\s*[^"'`]/.test(ctx.bundleSource);
  if (dangerous) {
    findings.push({
      category: "input-validation",
      severity: "medium",
      title: "Potential unsafe HTML rendering",
      detail:
        "The client code uses raw HTML injection (innerHTML / dangerouslySetInnerHTML). If any part is user-controlled, this is a DOM-XSS sink.",
      evidence: "innerHTML / dangerouslySetInnerHTML usage detected.",
      fixPrompt:
        "Avoid setting raw HTML from variables. Render text safely, and if HTML is required, sanitize it with a library like DOMPurify before injecting.",
    });
  }

  const hasForms = /<form[\s>]/i.test(ctx.html);
  if (hasForms) {
    findings.push({
      category: "input-validation",
      severity: "info",
      title: "Forms present — verify server-side validation",
      detail:
        "The page contains forms. Client-side validation alone is not a security control; ensure all input is validated and sanitized on the server.",
      evidence: "<form> element(s) found.",
      fixPrompt:
        "Validate and sanitize every form input on the server using a schema (e.g. Zod). Never trust client-side validation for security or rely on it to prevent injection.",
    });
  }

  return {
    id: "input-validation",
    label: "Input Validation",
    passed: findings.length === 0,
    findings,
  };
}

/* ─────────────────────── Authentication (heuristic) ─────────────────────── */

export function checkAuth(ctx: ScanContext): CategoryResult {
  const findings: Finding[] = [];

  // Look at any Set-Cookie that came back on the landing page.
  const setCookie = ctx.headers["set-cookie"];
  if (setCookie) {
    const lc = setCookie.toLowerCase();
    if (!lc.includes("httponly")) {
      findings.push({
        category: "auth",
        severity: "high",
        title: "Session cookie missing HttpOnly",
        detail:
          "A cookie was set without the HttpOnly flag, so JavaScript (and any XSS) can read it.",
        evidence: "Set-Cookie without HttpOnly.",
        fixPrompt:
          "Set HttpOnly, Secure, and SameSite=Lax (or Strict) on all session/auth cookies.",
      });
    }
    if (!lc.includes("secure")) {
      findings.push({
        category: "auth",
        severity: "medium",
        title: "Cookie missing Secure flag",
        detail:
          "A cookie was set without the Secure flag, so it can be transmitted over plain HTTP.",
        evidence: "Set-Cookie without Secure.",
        fixPrompt: "Add the Secure attribute to all cookies so they are only sent over HTTPS.",
      });
    }
    if (!lc.includes("samesite")) {
      findings.push({
        category: "auth",
        severity: "low",
        title: "Cookie missing SameSite",
        detail:
          "A cookie was set without SameSite, leaving it more exposed to CSRF.",
        evidence: "Set-Cookie without SameSite.",
        fixPrompt: "Add SameSite=Lax (or Strict) to cookies to mitigate CSRF.",
      });
    }
  }

  return {
    id: "auth",
    label: "Authentication Flaws",
    passed: findings.length === 0,
    findings,
  };
}
