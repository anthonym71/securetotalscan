import { safeFetch } from "./fetcher";
import type { CategoryResult, Finding, ScanContext } from "./types";

interface PathProbe {
  path: string;
  severity: Finding["severity"];
  category: "exposed-endpoints" | "database" | "info-disclosure";
  title: string;
  /** A response is only a finding if this predicate holds. */
  isExposed: (status: number, body: string, contentType: string) => boolean;
  detail: string;
  fixPrompt: string;
}

const PROBES: PathProbe[] = [
  {
    path: "/.env",
    severity: "critical",
    category: "exposed-endpoints",
    title: "Publicly accessible .env file",
    isExposed: (s, b) => s === 200 && /[A-Z0-9_]+=/.test(b),
    detail: "The .env file is served publicly, exposing every environment secret.",
    fixPrompt:
      "Ensure .env files are never deployed to or served by the web root. Add them to .gitignore and your host's ignore list, and rotate any secrets that were exposed.",
  },
  {
    path: "/.git/config",
    severity: "critical",
    category: "exposed-endpoints",
    title: "Exposed .git directory",
    isExposed: (s, b) => s === 200 && /\[core\]|\[remote/.test(b),
    detail:
      "The .git directory is downloadable, letting anyone reconstruct your full source history.",
    fixPrompt:
      "Block access to the .git directory at the web server / host level, and exclude it from your deployment artifact.",
  },
  {
    path: "/config.json",
    severity: "high",
    category: "info-disclosure",
    title: "Exposed config.json",
    isExposed: (s, b, ct) => s === 200 && ct.includes("json") && /key|secret|token|password/i.test(b),
    detail: "A config.json containing credential-like fields is publicly served.",
    fixPrompt:
      "Move configuration that contains secrets out of publicly served files; keep only non-sensitive public config client-side.",
  },
  {
    path: "/.well-known/security.txt",
    severity: "info",
    category: "info-disclosure",
    title: "No security.txt",
    // Inverted: finding when MISSING. Handled specially below.
    isExposed: () => false,
    detail: "No security.txt — researchers have no documented way to report vulnerabilities.",
    fixPrompt:
      "Add a /.well-known/security.txt with a contact for vulnerability reports (see securitytxt.org).",
  },
  {
    path: "/server-status",
    severity: "medium",
    category: "exposed-endpoints",
    title: "Apache server-status exposed",
    isExposed: (s, b) => s === 200 && /Apache Server Status/i.test(b),
    detail: "The Apache server-status page is public, leaking request and client details.",
    fixPrompt: "Restrict /server-status to localhost or disable mod_status in production.",
  },
  {
    path: "/phpinfo.php",
    severity: "high",
    category: "info-disclosure",
    title: "phpinfo() exposed",
    isExposed: (s, b) => s === 200 && /phpinfo\(\)|PHP Version/i.test(b),
    detail: "A phpinfo() page is public, disclosing full server configuration.",
    fixPrompt: "Delete phpinfo test files from production.",
  },
];

export async function runProbes(ctx: ScanContext): Promise<{
  exposed: CategoryResult;
  database: Finding[];
  infoDisclosure: Finding[];
}> {
  const origin = ctx.target.origin;
  const exposedFindings: Finding[] = [];
  const dbFindings: Finding[] = [];
  const infoFindings: Finding[] = [];

  const results = await Promise.all(
    PROBES.map(async (probe) => {
      const res = await safeFetch(origin + probe.path);
      return { probe, res };
    }),
  );

  for (const { probe, res } of results) {
    // Special inverted case: security.txt missing.
    if (probe.path === "/.well-known/security.txt") {
      if (res.status !== 200) {
        infoFindings.push(toFinding(probe));
      }
      continue;
    }

    const ct = res.headers["content-type"] ?? "";
    if (probe.isExposed(res.status, res.body, ct)) {
      const finding = toFinding(probe, origin + probe.path);
      if (probe.category === "database") dbFindings.push(finding);
      else if (probe.category === "info-disclosure") infoFindings.push(finding);
      else exposedFindings.push(finding);
    }
  }

  return {
    exposed: {
      id: "exposed-endpoints",
      label: "Exposed Endpoints",
      passed: exposedFindings.length === 0,
      findings: exposedFindings,
    },
    database: dbFindings,
    infoDisclosure: infoFindings,
  };
}

function toFinding(probe: PathProbe, evidence?: string): Finding {
  return {
    category: probe.category,
    severity: probe.severity,
    title: probe.title,
    detail: probe.detail,
    evidence: evidence ? `Reachable at ${evidence}` : undefined,
    fixPrompt: probe.fixPrompt,
  };
}
