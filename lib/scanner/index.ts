import {
  checkAuth,
  checkCors,
  checkDebugArtifacts,
  checkHeaders,
  checkInfoDisclosure,
  checkInputValidation,
} from "./checks";
import { checkHttpPosture, probeHttpOrigin } from "./httpPosture";
import { safeFetch } from "./fetcher";
import { runProbes } from "./probes";
import { buildReport } from "./score";
import { checkSecrets } from "./secrets";
import { ScanError, normalizeTarget } from "./target";
import type { CategoryResult, ScanContext, ScanReport } from "./types";

const MAX_BUNDLES = Number(process.env.SCAN_MAX_BUNDLES ?? 8);

// Target resolution lives in ./target so the browser can apply the same rules
// without importing the scanner. Re-exported here so existing callers and the
// verify scripts are unaffected. The server-side call in /api/scan is the
// authoritative one; the client copy only saves a wasted round trip.
export { ScanError, normalizeTarget };

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
  // Keep per-file sources so checks can separate application code from
  // framework/vendor chunks.
  const bundleSources = bundles.map((b, i) => ({
    url: scriptUrls[i] ?? b.url,
    source: b.body,
  }));
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
    bundles: bundleSources,
    notes,
  };

  // Port 80 is probed alongside the file probes rather than before them —
  // both are network work and neither depends on the other.
  const httpOriginProbe = target.protocol === "https:" ? probeHttpOrigin(target) : null;

  // Passive, content-based checks (synchronous).
  const headers = checkHeaders(ctx);
  const cors = checkCors(ctx);
  const debug = checkDebugArtifacts(ctx);
  const input_ = checkInputValidation(ctx);
  const auth = checkAuth(ctx);
  const { secrets, ai: aiFromSecrets, database: dbFromSecrets } = checkSecrets(ctx);

  // Active probes for exposed files/paths (network).
  const probes = await runProbes(ctx);
  const transport = checkHttpPosture(ctx, httpOriginProbe ? await httpOriginProbe : null);

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
    transport,
    probes.exposed,
    ai,
  ];

  return buildReport(finalUrl, categories, Date.now() - start, notes);
}
