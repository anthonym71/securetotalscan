// Offline verification of the pure analysis logic (no network needed).
// Run: npx tsc scripts/verify-scanner.ts lib/scanner/*.ts --outDir <tmp> ... && node <tmp>/scripts/verify-scanner.js
import {
  checkAuth,
  checkCors,
  checkDebugArtifacts,
  checkHeaders,
  checkInfoDisclosure,
  checkInputValidation,
} from "../lib/scanner/checks";
import { checkHttpPosture } from "../lib/scanner/httpPosture";
import { checkSecrets } from "../lib/scanner/secrets";
import { buildReport } from "../lib/scanner/score";
import type { ScanContext } from "../lib/scanner/types";

const ctx: ScanContext = {
  target: new URL("https://demo-vibe-app.example"),
  finalUrl: "https://demo-vibe-app.example",
  status: 200,
  headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-credentials": "true",
    "x-powered-by": "Express",
    "set-cookie": "session=abc123; Path=/",
  },
  html: `<html><body><form></form>
    <script src="/static/app.js"></script>
    <img src="http://cdn.example/logo.png"></body></html>`,
  scriptUrls: ["https://demo-vibe-app.example/static/app.js"],
  bundleSource: `
    const aws = "AKIAIOSFODNN7EXAMPLE";
    const openai = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const api = "http://localhost:5000/api";
    el.innerHTML = userInput;
    //# sourceMappingURL=app.js.map
  `,
  notes: [],
};

const { secrets, ai, database } = checkSecrets(ctx);
const categories = [
  { id: "database" as const, label: "Database Security", findings: database, passed: database.length === 0 },
  secrets,
  checkHeaders(ctx),
  checkCors(ctx),
  checkInfoDisclosure(ctx),
  checkDebugArtifacts(ctx),
  checkInputValidation(ctx),
  checkAuth(ctx),
  // PR 1.3 re-baseline: transport is now graded on what port 80 actually
  // does, not only on the scheme the target was requested with. The fixture
  // stands in for a site that redirects properly but sets no HSTS — a common,
  // realistic posture — so the expected total below moved up by one.
  checkHttpPosture(ctx, {
    reachable: true,
    status: 301,
    location: "https://demo-vibe-app.example/",
    redirectsToHttps: true,
    sameHost: true,
    permanent: true,
  }),
  { id: "ai-risks" as const, label: "AI-Specific Risks", findings: ai, passed: ai.length === 0 },
];

const report = buildReport(ctx.finalUrl, categories, 1234, []);
console.log(`GRADE: ${report.grade}  SCORE: ${report.score}`);
console.log("SUMMARY:", JSON.stringify(report.summary));
console.log("FINDINGS:");
for (const c of report.categories) {
  for (const f of c.findings) {
    console.log(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.title}`);
  }
}
// Re-baselined in PR 1.3. Two changes cancel out in the count: the transport
// check adds findings, and `strict-transport-security` was removed from the
// generic missing-header list because the transport check now grades the
// policy properly. Before this PR the fixture reported HSTS twice and was
// penalised twice for one header.
const transportFindings = report.categories
  .filter((c) => c.id === "ssl-tls")
  .flatMap((c) => c.findings);
const ok =
  report.grade === "F" &&
  report.summary.critical >= 2 && // AWS key + OpenAI key + wildcard-cors-with-creds
  report.summary.total >= 8 &&
  // The fixture's HTML references an http:// image and it sets no HSTS, so
  // both must be reported. If either disappears, the transport check has
  // regressed rather than the fixture having improved.
  transportFindings.some((f) => f.title === "No HSTS header") &&
  transportFindings.some((f) => f.title.startsWith("Mixed content")) &&
  // Exactly one HSTS finding, from the transport check and nowhere else.
  report.categories.flatMap((c) => c.findings).filter((f) => /HSTS|strict-transport/i.test(f.title))
    .length === 1;
console.log(ok ? "\nVERIFY: PASS ✅" : "\nVERIFY: FAIL ❌");
process.exit(ok ? 0 : 1);
