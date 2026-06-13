import {
  checkAuth,
  checkCors,
  checkDebugArtifacts,
  checkHeaders,
  checkInfoDisclosure,
  checkInputValidation,
  checkSsl,
} from "./checks";
import { safeFetch } from "./fetcher";
import { runProbes } from "./probes";
import { buildReport } from "./score";
import { checkSecrets } from "./secrets";
import type { CategoryResult, ScanContext, ScanReport } from "./types";

const MAX_BUNDLES = Number(process.env.SCAN_MAX_BUNDLES ?? 8);

export class ScanError extends Error {}

/** Resolve and validate a user-supplied URL. Blocks obvious SSRF targets. */
export function normalizeTarget(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    throw new ScanError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ScanError("Only http and https URLs can be scanned.");
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    !host.includes(".");
  if (blocked) {
    throw new ScanError("For safety, internal and private addresses cannot be scanned.");
  }
  return url;
}

/** Extract same-origin script URLs from an HTML document. */
function extractScripts(html: string, base: URL): string[] {
  const urls = new Set<string>();
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], base);
      // Same-origin bundles only — avoid fetching third-party CDNs.
      if (abs.origin === base.origin) urls.add(abs.toString());
    } catch {
      /* ignore malformed src */
    }
  }
  return [...urls];
}

export async function scan(input: string): Promise<ScanReport> {
  const start = Date.now();
  const target = normalizeTarget(input);
  const notes: string[] = [];

  const root = await safeFetch(target.toString());
  if (root.status === 0) {
    throw new ScanError(
      `Could not reach ${target.hostname}. Check the URL is public and online.`,
    );
  }

  const finalUrl = root.url;
  const scriptUrls = extractScripts(root.body, target).slice(0, MAX_BUNDLES);

  // Fetch the JS bundles concurrently so we can scan their source.
  const bundles = await Promise.all(scriptUrls.map((u) => safeFetch(u)));
  const bundleSource = bundles.map((b) => b.body).join("\n");
  if (scriptUrls.length === 0) {
    notes.push("No same-origin JavaScript bundles were found to scan for secrets.");
  }

  const ctx: ScanContext = {
    target,
    finalUrl,
    status: root.status,
    headers: root.headers,
    html: root.body,
    scriptUrls,
    bundleSource,
    notes,
  };

  // Passive, content-based checks (synchronous).
  const headers = checkHeaders(ctx);
  const cors = checkCors(ctx);
  const ssl = checkSsl(ctx);
  const debug = checkDebugArtifacts(ctx);
  const input_ = checkInputValidation(ctx);
  const auth = checkAuth(ctx);
  const { secrets, ai: aiFromSecrets, database: dbFromSecrets } = checkSecrets(ctx);

  // Active probes for exposed files/paths (network).
  const probes = await runProbes(ctx);

  // Merge cross-cutting findings into their canonical categories.
  const database: CategoryResult = {
    id: "database",
    label: "Database Security",
    findings: [...dbFromSecrets, ...probes.database],
    passed: dbFromSecrets.length + probes.database.length === 0,
  };
  const ai: CategoryResult = {
    id: "ai-risks",
    label: "AI-Specific Risks",
    findings: aiFromSecrets,
    passed: aiFromSecrets.length === 0,
  };
  const infoDisclosure: CategoryResult = {
    ...checkInfoDisclosure(ctx),
  };
  infoDisclosure.findings.push(...probes.infoDisclosure);
  infoDisclosure.passed = infoDisclosure.findings.length === 0;

  // Dependencies can't be enumerated passively without a manifest; note it.
  const dependencies: CategoryResult = {
    id: "dependencies",
    label: "Insecure Dependencies",
    findings: [],
    passed: true,
  };
  notes.push(
    "Dependency CVE analysis requires source/lockfile access and is reported separately.",
  );

  const categories: CategoryResult[] = [
    database,
    secrets,
    headers,
    cors,
    infoDisclosure,
    dependencies,
    debug,
    input_,
    auth,
    ssl,
    probes.exposed,
    ai,
  ];

  return buildReport(finalUrl, categories, Date.now() - start, notes);
}
